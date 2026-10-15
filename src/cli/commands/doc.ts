import { TroveError } from "../../core/errors.ts";
import { archivePlan } from "../../core/ops/doc-archive.ts";
import { newDocument } from "../../core/ops/doc-new.ts";
import { retypePlan } from "../../core/ops/doc-retype.ts";
import { setDocumentField } from "../../core/ops/doc-set.ts";
import { requireDocument } from "../../core/ops/find.ts";
import { isIsoDate } from "../../core/text/dates.ts";
import { parse, parsePairs } from "../args.ts";
import type { Command } from "../command.ts";
import { defineGroup } from "../group.ts";
import { OP_OPTIONS, runPlan } from "../ops.ts";
import { openFromFlags } from "../store.ts";

const docNew: Command = {
  name: "new",
  summary: "Create a document from the type's template",
  usage: "trove doc new <type> <topic> [--name STEM] [--field key=value]... [--scope S]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...OP_OPTIONS,
      name: { type: "string" },
      scope: { type: "string" },
      field: { type: "string", multiple: true },
    });
    const [type, ...words] = positionals;
    if (!type || words.length === 0) throw new TroveError("doc new needs a type and a topic");

    const fields = parsePairs(values.field ?? []);
    if (values.scope) fields.scope = values.scope;
    const store = await openFromFlags(values, io);
    const plan = await newDocument(store.index, {
      type,
      topic: words.join(" "),
      name: values.name,
      fields,
    });
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

const docArchive: Command = {
  name: "archive",
  summary: "Move a document into the archive and fix links to it",
  usage: "trove doc archive <document> [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OP_OPTIONS);
    const [name] = positionals;
    if (!name) throw new TroveError("doc archive needs a document");
    const store = await openFromFlags(values, io);
    const plan = archivePlan(store.index, requireDocument(store.index, name));
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

const docChecked: Command = {
  name: "checked",
  summary: "Mark a document re-checked today, or on --date",
  usage: "trove doc checked <document> [--date YYYY-MM-DD] [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, { ...OP_OPTIONS, date: { type: "string" } });
    const [name] = positionals;
    if (!name) throw new TroveError("doc checked needs a document");
    if (values.date && !isIsoDate(values.date)) throw new TroveError(`not a date: ${values.date}`);
    const store = await openFromFlags(values, io);
    const plan = setDocumentField(store.index, name, "checked", values.date ?? store.index.today);
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

const docSet: Command = {
  name: "set",
  summary: "Set a header field; status also updates the status line",
  usage: "trove doc set <document> <field> <value> [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OP_OPTIONS);
    const [name, field, ...rest] = positionals;
    if (!name || !field || rest.length === 0)
      throw new TroveError("doc set needs a document, a field and a value");
    const store = await openFromFlags(values, io);
    const plan = setDocumentField(store.index, name, field, rest.join(" "));
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

const docRetype: Command = {
  name: "retype",
  summary: "Turn a document into another type: folder, prefix, status, links follow",
  usage: "trove doc retype <document> <type> [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OP_OPTIONS);
    const [name, type] = positionals;
    if (!name || !type) throw new TroveError("doc retype needs a document and a type");
    const store = await openFromFlags(values, io);
    const plan = retypePlan(store.index, requireDocument(store.index, name), type);
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

export const doc = defineGroup("doc", "Create, archive and update documents", [
  docNew,
  docArchive,
  docChecked,
  docSet,
  docRetype,
]);
