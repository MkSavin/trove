import { TroveError } from "../../core/errors.ts";
import { writeReports } from "../../core/reports/write.ts";
import { runRules } from "../../core/rules/run.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { formatDiagnostics } from "../format/diagnostics.ts";
import { plural } from "../format/plural.ts";
import { painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";
import { openFromFlags } from "../store.ts";

export const report: Command = {
  name: "report",
  summary: "Rebuild generated documents (all, or the named ones)",
  usage: "trove report [name...]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, STORE_OPTIONS);
    const store = await openFromFlags(values, io);
    const known = Object.keys(store.config.reports);
    const names = positionals.length > 0 ? positionals : known;
    const unknown = names.find((name) => !known.includes(name));
    if (unknown) throw new TroveError(`no report ${unknown}; known: ${known.join(", ") || "none"}`);

    const paint = painter(io);
    const errors = runRules(store.rules, store.index).filter((d) => d.severity === "error");
    if (errors.length > 0) {
      for (const line of formatDiagnostics(errors, paint)) io.print(line);
      io.print(paint("red", "✖ reports not written: fix the errors above first"));
      return EXIT.failed;
    }

    const results = await writeReports(store.index, names);
    const rows = results.map((result) => [
      result.output,
      plural(result.rows, "row"),
      result.changed ? paint("green", "updated") : paint("dim", "unchanged"),
    ]);
    for (const line of formatTable(rows)) io.print(line);
    return EXIT.ok;
  },
};
