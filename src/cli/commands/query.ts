import { TroveError } from "../../core/errors.ts";
import { defaultFields, isKind, KINDS, queryRows } from "../../core/index/rows.ts";
import { parse, parseFilters, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { formatTable } from "../format/table.ts";
import { openFromFlags } from "../store.ts";

export const query: Command = {
  name: "query",
  summary: "List items or documents matching field=value filters",
  usage: "trove query <items|documents> [field=value[,value]...] [--fields a,b] [--json]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      fields: { type: "string" },
      json: { type: "boolean", default: false },
    });
    const [kind, ...pairs] = positionals;
    if (!isKind(kind)) throw new TroveError(`query what? ${KINDS.join(" or ")}`);

    const store = await openFromFlags(values, io);
    const fields = values.fields?.split(",") ?? defaultFields(kind, store.index);
    const rows = queryRows(store.index, kind, parseFilters(pairs), fields);

    if (values.json) {
      io.print(JSON.stringify(rows, null, 2));
    } else {
      const table = formatTable([fields, ...rows.map((row) => fields.map((f) => row[f] ?? ""))]);
      for (const line of table) io.print(line);
      io.print(`${rows.length} ${kind}`);
    }
    return EXIT.ok;
  },
};
