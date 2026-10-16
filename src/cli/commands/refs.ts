import { TroveError } from "../../core/errors.ts";
import { codeTarget, linesOption } from "../../core/index/code-target.ts";
import { codeUsers } from "../../core/index/code-users.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { plural } from "../format/plural.ts";
import { formatTable } from "../format/table.ts";
import { openFromFlags } from "../store.ts";

export const refs: Command = {
  name: "refs",
  summary: "List open items, plans and specs that point at a code file, folder or glob",
  usage: "trove refs <file|dir|glob> [--lines A-B] [--all] [--json]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      lines: { type: "string" },
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    });
    const [written] = positionals;
    if (written === undefined) throw new TroveError("refs of what? a file, folder or glob");
    const lines = linesOption(values.lines);
    const store = await openFromFlags(values, io);
    const target = codeTarget(store.index, io.cwd, written, lines);
    const { fields, rows } = codeUsers(store.index, target, values.all);

    if (values.json) {
      io.print(JSON.stringify(rows, null, 2));
    } else {
      const table = formatTable([fields, ...rows.map((row) => fields.map((f) => row[f] ?? ""))]);
      for (const line of table) io.print(line);
      io.print(plural(rows.length, "reference"));
    }
    return EXIT.ok;
  },
};
