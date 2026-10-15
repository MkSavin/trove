import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { TroveError } from "../../core/errors.ts";
import type { StoreIndex } from "../../core/index/index.ts";
import { archivePlan } from "../../core/ops/doc-archive.ts";
import { newDocument } from "../../core/ops/doc-new.ts";
import { retypePlan } from "../../core/ops/doc-retype.ts";
import { setDocumentField } from "../../core/ops/doc-set.ts";
import { requireDocument } from "../../core/ops/find.ts";
import { addItem } from "../../core/ops/item-add.ts";
import { closeItem } from "../../core/ops/item-close.ts";
import { deferItem } from "../../core/ops/item-defer.ts";
import { moveItem } from "../../core/ops/item-move.ts";
import type { Plan } from "../../core/ops/plan.ts";
import { newSummary } from "../../core/summaries/summaries.ts";
import {
  asFilters,
  type Context,
  dryRunField,
  filtersField,
  openFor,
  storeField,
} from "../context.ts";
import { runPlanTool } from "../operation.ts";
import { guarded } from "../respond.ts";

const EDIT = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const ITEM_ACTIONS = ["add", "close", "defer", "move"] as const;

type ItemArgs = {
  action: (typeof ITEM_ACTIONS)[number];
  id?: string | undefined;
  document?: string | undefined;
  values?: Record<string, string> | undefined;
  commit?: string | undefined;
  archive?: boolean | undefined;
  section?: string | undefined;
  as?: string | undefined;
};

const required = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new TroveError(`${what} is required for this action`);
  return value;
};

const itemPlan = async (index: StoreIndex, args: ItemArgs): Promise<Plan> => {
  switch (args.action) {
    case "add":
      return addItem(index, {
        document: required(args.document, "document"),
        values: args.values ?? {},
      });
    case "close":
      return closeItem(index, required(args.id, "id"), {
        as: args.as,
        commit: args.commit,
        archive: args.archive,
      });
    case "defer":
      return deferItem(index, required(args.id, "id"));
    case "move":
      return moveItem(index, required(args.id, "id"), required(args.document, "document"), {
        archive: args.archive,
        section: args.section,
      });
  }
};

export const registerEditTools = (server: McpServer, context: Context): void => {
  server.registerTool(
    "trove_create",
    {
      description:
        "Create a document from its type's template: folder, prefix, next series number and slug are chosen for you. Required header fields go in fields, e.g. {scope: 'web/'}. With kind, a summary of that configured kind instead: generated blocks filled, <!-- write: … --> places left for you to write up; filters narrow it further.",
      inputSchema: z.object({
        store: storeField,
        type: z.string(),
        topic: z.string().describe("Human title; also the file name unless name is given"),
        name: z.string().optional().describe("File name stem without prefix, e.g. WEB_CLIENT"),
        fields: z.record(z.string(), z.string()).optional(),
        kind: z
          .string()
          .optional()
          .describe("A summary kind from the config; type is then ignored"),
        filters: filtersField.optional(),
        dryRun: dryRunField,
      }),
      annotations: EDIT,
    },
    guarded(async ({ store, type, topic, name, fields, kind, filters, dryRun }) => {
      const opened = await openFor(context, store);
      const plan = kind
        ? await newSummary(opened.index, { kind, title: topic, name, filters: asFilters(filters) })
        : await newDocument(opened.index, { type, topic, name, fields });
      return runPlanTool(opened, plan, dryRun);
    }),
  );

  server.registerTool(
    "trove_update",
    {
      description:
        "Set one header field of a document. status and checked also update the visible status line; checked without a value means today.",
      inputSchema: z.object({
        store: storeField,
        document: z.string(),
        field: z.string(),
        value: z.string().optional(),
        dryRun: dryRunField,
      }),
      annotations: EDIT,
    },
    guarded(async ({ store, document, field, value, dryRun }) => {
      const opened = await openFor(context, store);
      const written = value ?? (field === "checked" ? opened.index.today : undefined);
      const plan = setDocumentField(opened.index, document, field, required(written, "value"));
      return runPlanTool(opened, plan, dryRun);
    }),
  );

  server.registerTool(
    "trove_transition",
    {
      description:
        "Move a document along its lifecycle. to=archive moves it into the archive mirror, sets its status and fixes links; to=type with type turns it into another type (e.g. research that became a plan of work, see trove_regulation placement). A refusal lists what is still missing.",
      inputSchema: z.object({
        store: storeField,
        document: z.string(),
        to: z.enum(["archive", "type"]),
        type: z.string().optional().describe("The new type, for to=type"),
        dryRun: dryRunField,
      }),
      annotations: EDIT,
    },
    guarded(async ({ store, document, to, type, dryRun }) => {
      const opened = await openFor(context, store);
      const doc = requireDocument(opened.index, document);
      const plan =
        to === "archive"
          ? archivePlan(opened.index, doc)
          : retypePlan(opened.index, doc, required(type, "type"));
      return runPlanTool(opened, plan, dryRun);
    }),
  );

  server.registerTool(
    "trove_item",
    {
      description:
        "Ledger items. add: document + values by column key (priority, owner, what, …), gets the next id and a section stub; in a ledger with several tables, values.section names the heading of the table.  close: id, optional commit sha and as (how it was closed: a key of the ledger's closed outcomes, e.g. fixed or dropped; the first by default); a type with closeInto moves the row and section into the audit's resolved companion; archive=true when it is the audit's last open item. defer: id. move: id + document (the target ledger), section for its table; archive=true when the source is left without open items.",
      inputSchema: z.object({
        store: storeField,
        action: z.enum(ITEM_ACTIONS),
        id: z.string().optional(),
        document: z.string().optional(),
        values: z.record(z.string(), z.string()).optional(),
        commit: z.string().optional(),
        archive: z.boolean().optional(),
        section: z.string().optional(),
        as: z.string().optional(),
        dryRun: dryRunField,
      }),
      annotations: EDIT,
    },
    guarded(async ({ store, dryRun, ...args }) => {
      const opened = await openFor(context, store);
      return runPlanTool(opened, await itemPlan(opened.index, args), dryRun);
    }),
  );
};
