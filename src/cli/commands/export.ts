import { resolve } from "node:path";
import { TroveError } from "../../core/errors.ts";
import { toCsv } from "../../core/export/csv.ts";
import { defaultFields, isKind, KINDS, queryRows } from "../../core/index/rows.ts";
import { parse, parseFilters, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { openFromFlags } from "../store.ts";

const FORMATS = ["csv", "json"] as const;

export const exportCommand: Command = {
  name: "export",
  summary: "Export items or documents as CSV or JSON, e.g. for a CRM",
  usage:
    "trove export <items|documents> [field=value...] [--format csv|json] [--fields a,b] [--out FILE]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      format: { type: "string", default: "csv" },
      fields: { type: "string" },
      out: { type: "string" },
    });
    const [kind, ...pairs] = positionals;
    if (!isKind(kind)) throw new TroveError(`export what? ${KINDS.join(" or ")}`);
    const format = FORMATS.find((candidate) => candidate === values.format);
    if (!format) throw new TroveError(`format must be one of ${FORMATS.join(", ")}`);

    const store = await openFromFlags(values, io);
    const fields = values.fields?.split(",") ?? defaultFields(kind, store.index);
    const rows = queryRows(store.index, kind, parseFilters(pairs), fields);
    const text = format === "csv" ? toCsv(rows, fields) : `${JSON.stringify(rows, null, 2)}\n`;

    if (values.out) {
      await Bun.write(resolve(io.cwd, values.out), text);
      io.error(`${rows.length} ${kind} → ${values.out}`);
    } else {
      io.write(text);
    }
    return EXIT.ok;
  },
};
