import { TroveError } from "../../core/errors.ts";
import { isKind, KINDS, queryRows } from "../../core/index/rows.ts";
import { COLUMN_OPTIONS, parse, parseFilters, requestedColumns, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { formatTable } from "../format/table.ts";
import { openFromFlags } from "../store.ts";

export const query: Command = {
  name: "query",
  summary: "List items or documents matching field=value filters",
  usage: "trove query <items|documents> [field=value[,value]...] [--columns a,b] [--json]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      ...COLUMN_OPTIONS,
      json: { type: "boolean", default: false },
    });
    const [kind, ...pairs] = positionals;
    if (!isKind(kind)) throw new TroveError(`query what? ${KINDS.join(" or ")}`);

    const store = await openFromFlags(values, io);
    const filters = parseFilters(pairs);
    const { fields, rows } = queryRows(store.index, kind, filters, requestedColumns(values));

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
