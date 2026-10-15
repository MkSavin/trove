import { newSummary, showSummary } from "../../core/summaries/summaries.ts";
import { parse, parseFilters } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { defineGroup } from "../group.ts";
import { OP_OPTIONS, runPlan } from "../ops.ts";
import { openFromFlags } from "../store.ts";

const isFilter = (arg: string): boolean => arg.includes("=");

const OPTIONS = { ...OP_OPTIONS, title: { type: "string" }, name: { type: "string" } } as const;

const request = (
  positionals: readonly string[],
  values: { title?: string | undefined; name?: string | undefined },
) => ({
  kind: positionals.find((arg) => !isFilter(arg)),
  title: values.title,
  name: values.name,
  filters: parseFilters(positionals.filter(isFilter)),
});

const summaryShow: Command = {
  name: "show",
  summary: "Print a summary of a kind, or of the built-in layout, without writing it",
  usage: "trove summary show [kind] [field=value...] [--title TEXT]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OPTIONS);
    const store = await openFromFlags(values, io);
    io.write(await showSummary(store.index, request(positionals, values)));
    return EXIT.ok;
  },
};

const summaryNew: Command = {
  name: "new",
  summary: "Create a summary document of a kind: generated blocks filled, places left to write",
  usage:
    "trove summary new <kind> [field=value...] [--title TEXT] [--name STEM_AFTER_PREFIX] [--dry-run]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, OPTIONS);
    const store = await openFromFlags(values, io);
    const plan = await newSummary(store.index, request(positionals, values));
    return runPlan(store, plan, io, values["dry-run"]);
  },
};

export const summary = defineGroup(
  "summary",
  "Summaries: generated status blocks plus written analysis",
  [summaryNew, summaryShow],
);
