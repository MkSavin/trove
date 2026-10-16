import { requireDocument } from "../../core/ops/find.ts";
import { refreshPlan } from "../../core/ops/refresh.ts";
import { parse } from "../args.ts";
import type { Command } from "../command.ts";
import { OP_OPTIONS, runPlan } from "../ops.ts";
import { openFromFlags } from "../store.ts";

export const refresh: Command = {
  name: "refresh",
  summary: "Refill the generated blocks of the named documents, or of every live one",
  usage: "trove refresh [document...] [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OP_OPTIONS);
    const store = await openFromFlags(values, io);
    const docs = positionals.map((name) => requireDocument(store.index, name));
    return runPlan(store, await refreshPlan(store.index, docs), io, values["dry-run"]);
  },
};
