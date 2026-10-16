import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { TroveError } from "../../core/errors.ts";
import { excerpts, formatExcerpts } from "../../core/index/excerpt.ts";
import { findDocument } from "../../core/index/resolve.ts";
import { KINDS, queryRows } from "../../core/index/rows.ts";
import { regulation, TOPICS } from "../../core/regulation/regulation.ts";
import { runRules } from "../../core/rules/run.ts";
import { showSummary } from "../../core/summaries/summaries.ts";
import { asFilters, type Context, filtersField, openFor, storeField } from "../context.ts";
import { guarded, json, text } from "../respond.ts";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const DEFAULT_LIMIT = 50;
const SEVERITY_ORDER = ["error", "warn", "info"] as const;

export const registerReadTools = (server: McpServer, context: Context): void => {
  server.registerTool(
    "trove_query",
    {
      description:
        "List ledger items or documents matching filters, as rows. Filter any field by value or vocabulary key, e.g. {status: 'open', owner: ['web', 'api']}; items also take drift ('true': code the item's row or section points at changed after its document's checked date; 'false': unchanged; 'unknown': nothing could be checked); documents also take place (work|archive), folder, type, stale ('true'), and for types with stages progress ('3/5') and next (the next stage).",
      inputSchema: z.object({
        store: storeField,
        kind: z.enum(KINDS),
        filters: filtersField.optional(),
        fields: z
          .array(z.string())
          .optional()
          .describe("Columns to return; by default the columns of the matched items' ledgers"),
        limit: z.int().positive().optional(),
      }),
      annotations: READ_ONLY,
    },
    guarded(async ({ store, kind, filters, fields, limit }) => {
      const opened = await openFor(context, store);
      const { rows } = queryRows(opened.index, kind, asFilters(filters), fields);
      const cap = limit ?? DEFAULT_LIMIT;
      return json({ total: rows.length, rows: rows.slice(0, cap), truncated: rows.length > cap });
    }),
  );

  server.registerTool(
    "trove_show",
    {
      description:
        "Read one item's own section by id (e.g. WEB1-3; a closed one too, every section titled by it when no ledger holds it), one section as DOCUMENT#heading, or a document's outline by name. Prefer this to reading whole files.",
      inputSchema: z.object({ store: storeField, ref: z.string() }),
      annotations: READ_ONLY,
    },
    guarded(async ({ store, ref }) => {
      return text(formatExcerpts(excerpts((await openFor(context, store)).index, ref)));
    }),
  );

  server.registerTool(
    "trove_check",
    {
      description:
        "Run the store's rules: headers, ledgers, placement, freshness. Returns diagnostics at or above the given severity (default warn).",
      inputSchema: z.object({
        store: storeField,
        path: z.string().optional().describe("Store-relative path of one document"),
        severity: z.enum(SEVERITY_ORDER).optional(),
      }),
      annotations: READ_ONLY,
    },
    guarded(async ({ store, path, severity }) => {
      const opened = await openFor(context, store);
      const allowed = SEVERITY_ORDER.slice(0, SEVERITY_ORDER.indexOf(severity ?? "warn") + 1);
      const diagnostics = runRules(opened.rules, opened.index).filter(
        (d) => allowed.includes(d.severity) && (path === undefined || d.file === path),
      );
      return json({
        documents: opened.index.documents.length,
        errors: diagnostics.filter((d) => d.severity === "error").length,
        diagnostics,
      });
    }),
  );

  server.registerTool(
    "trove_summary",
    {
      description:
        "Render a summary as Markdown without writing it: counts, open items, documents in work. Pass a kind from the config and/or filters like trove_query's, e.g. {owner: 'web', path: '!audits/mobile/**'}. To keep one as a document, use trove_create with kind.",
      inputSchema: z.object({
        store: storeField,
        kind: z.string().optional(),
        title: z.string().optional(),
        filters: filtersField.optional(),
      }),
      annotations: READ_ONLY,
    },
    guarded(async ({ store, kind, title, filters }) => {
      const opened = await openFor(context, store);
      return text(await showSummary(opened.index, { kind, title, filters: asFilters(filters) }));
    }),
  );

  server.registerTool(
    "trove_prompt",
    {
      description: "The task text of a prompt document: everything after its prompt marker.",
      inputSchema: z.object({ store: storeField, name: z.string() }),
      annotations: READ_ONLY,
    },
    guarded(async ({ store, name }) => {
      const doc = findDocument((await openFor(context, store)).index, name);
      if (!doc?.prompt) throw new TroveError(`${name} is not a prompt with a task marker`);
      return text(doc.prompt.text);
    }),
  );

  server.registerTool(
    "trove_regulation",
    {
      description:
        "How this store works, generated from its config: overview, types, ledger, lifecycle, rules, workflow. Read workflow first.",
      inputSchema: z.object({ store: storeField, topic: z.enum(TOPICS) }),
      annotations: READ_ONLY,
    },
    guarded(async ({ store, topic }) => {
      const opened = await openFor(context, store);
      return text(regulation(opened.config, opened.rules, topic));
    }),
  );
};
