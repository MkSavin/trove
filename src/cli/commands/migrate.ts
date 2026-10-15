import { TroveError } from "../../core/errors.ts";
import { migrateArchive } from "../../core/migrate/migrate.ts";
import { isLanguage, LANGUAGES } from "../../core/presets/presets.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { countSeverities, formatCounts } from "../format/diagnostics.ts";
import { painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";

export const migrate: Command = {
  name: "migrate",
  summary: "Build a new store from an existing archive; the archive is only read",
  usage:
    "trove migrate <archive> <new-store> [--lang en|ru] [--drop FILE]... [--project DIR [--link]] [--name NAME]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      lang: { type: "string" },
      drop: { type: "string", multiple: true },
      project: { type: "string" },
      link: { type: "boolean", default: false },
      name: { type: "string" },
    });
    const [source, target] = positionals;
    if (!source || !target)
      throw new TroveError("migrate needs the archive and the new store folder");
    if (values.lang && !isLanguage(values.lang)) {
      throw new TroveError(`language must be one of ${LANGUAGES.join(", ")}`);
    }
    if (values.link && !values.project) throw new TroveError("--link needs --project");

    const result = await migrateArchive({
      cwd: io.cwd,
      source,
      target,
      language: values.lang && isLanguage(values.lang) ? values.lang : undefined,
      drop: values.drop,
      project: values.project,
      link: values.link,
      name: values.name,
    });

    const paint = painter(io);
    const rows = [
      ["store", result.target],
      ["language", result.language],
      ["history", result.history ? "kept" : "none: imported as files"],
      ["uncommitted", `${result.uncommitted.length} files carried over`],
      ["dropped", result.dropped.join(", ") || "nothing"],
      ["commits", result.commits.join("; ") || "none"],
      ["check", formatCounts(countSeverities(result.diagnostics))],
    ];
    for (const line of formatTable(rows)) io.print(line);
    io.print(paint("bold", "inventory"));
    for (const line of formatTable(
      Object.entries(result.inventory).map(([k, v]) => [k, String(v)]),
    )) {
      io.print(`  ${line}`);
    }
    for (const note of result.notes) io.print(paint("yellow", `  ! ${note}`));
    for (const lost of result.lost) io.print(paint("red", `  ✖ ${lost}`));
    io.print(
      result.lost.length === 0
        ? paint("green", "✔ every document and item came over")
        : paint("red", "✖ counts changed during migration"),
    );
    return result.lost.length === 0 ? EXIT.ok : EXIT.failed;
  },
};
