import { TroveError } from "../../core/errors.ts";
import { pageOf, shownText } from "../../core/index/page.ts";
import { BRIEF_FIELDS, isKind, KINDS, queryRows } from "../../core/index/rows.ts";
import {
  COLUMN_OPTIONS,
  nonNegativeInteger,
  parse,
  parseFilters,
  positiveInteger,
  requestedColumns,
  STORE_OPTIONS,
} from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { formatTable } from "../format/table.ts";
import { openFromFlags } from "../store.ts";

export const query: Command = {
  name: "query",
  summary: "List items or documents matching field=value filters",
  usage:
    "trove query <items|documents> [field=value[,value]...] [--columns a,b | --brief] [--limit N] [--offset N] [--json]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      ...COLUMN_OPTIONS,
      brief: { type: "boolean", default: false },
      limit: { type: "string" },
      offset: { type: "string" },
      json: { type: "boolean", default: false },
    });
    const [kind, ...pairs] = positionals;
    if (!isKind(kind)) throw new TroveError(`query what? ${KINDS.join(" or ")}`);
    const limit = positiveInteger("limit", values.limit);
    const offset = nonNegativeInteger("offset", values.offset);

    const store = await openFromFlags(values, io);
    const filters = parseFilters(pairs);
    const columns = requestedColumns(values) ?? (values.brief ? BRIEF_FIELDS[kind] : undefined);
    const { fields, rows } = queryRows(store.index, kind, filters, columns);
    const page = pageOf(rows, { limit, offset });
    const shown = shownText(page);
    const note = shown && `${shown} ${kind}${page.next ? `; pass --offset ${page.next}` : ""}`;

    if (values.json) {
      io.print(JSON.stringify(page.rows, null, 2));
      if (note) io.error(note);
    } else {
      const table = formatTable([
        fields,
        ...page.rows.map((row) => fields.map((f) => row[f] ?? "")),
      ]);
      for (const line of table) io.print(line);
      io.print(note ?? `${rows.length} ${kind}`);
    }
    return EXIT.ok;
  },
};
