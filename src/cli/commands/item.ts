import { TroveError } from "../../core/errors.ts";
import { addItem } from "../../core/ops/item-add.ts";
import { closeItem } from "../../core/ops/item-close.ts";
import { deferItem } from "../../core/ops/item-defer.ts";
import { moveItem } from "../../core/ops/item-move.ts";
import { parse, parsePairs } from "../args.ts";
import type { Command } from "../command.ts";
import { defineGroup } from "../group.ts";
import { OP_OPTIONS, runPlan } from "../ops.ts";
import { openFromFlags } from "../store.ts";

const itemAdd: Command = {
  name: "add",
  summary: "Add a ledger row and a section stub with the next id",
  usage: "trove item add <document> column=value... [section=HEADING] [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OP_OPTIONS);
    const [document, ...pairs] = positionals;
    if (!document) throw new TroveError("item add needs a document");
    const cells = parsePairs(pairs);
    const store = await openFromFlags(values, io);
    const plan = addItem(store.index, { document, values: cells });
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

const itemClose: Command = {
  name: "close",
  summary: "Close an item: into the resolved companion, or marked closed in place",
  usage: "trove item close <id> [--as OUTCOME] [--commit SHA] [--archive] [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...OP_OPTIONS,
      as: { type: "string" },
      commit: { type: "string" },
      archive: { type: "boolean", default: false },
    });
    const [id] = positionals;
    if (!id) throw new TroveError("item close needs an id");
    const store = await openFromFlags(values, io);
    const plan = await closeItem(store.index, id, {
      as: values.as,
      commit: values.commit,
      archive: values.archive,
    });
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

const itemDefer: Command = {
  name: "defer",
  summary: "Mark an item deferred in its row and section",
  usage: "trove item defer <id> [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OP_OPTIONS);
    const [id] = positionals;
    if (!id) throw new TroveError("item defer needs an id");
    const store = await openFromFlags(values, io);
    return runPlan(store, deferItem(store.index, id), io, values["dry-run"]);
  },
};

const itemMove: Command = {
  name: "move",
  summary: "Move an item with its section to another ledger under the next id there",
  usage: "trove item move <id> <document> [--section HEADING] [--archive] [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...OP_OPTIONS,
      archive: { type: "boolean", default: false },
      section: { type: "string" },
    });
    const [id, target] = positionals;
    if (!id || !target) throw new TroveError("item move needs an id and a target document");
    const store = await openFromFlags(values, io);
    const plan = await moveItem(store.index, id, target, {
      archive: values.archive,
      section: values.section,
    });
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

export const item = defineGroup("item", "Add, close, defer and move ledger items", [
  itemAdd,
  itemClose,
  itemDefer,
  itemMove,
]);
