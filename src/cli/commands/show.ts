import { TroveError } from "../../core/errors.ts";
import { excerpts, formatExcerpts } from "../../core/index/excerpt.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { openFromFlags } from "../store.ts";

export const show: Command = {
  name: "show",
  summary: "Print one item's section, a DOCUMENT#heading section, or a document outline",
  usage: "trove show <item-id | DOCUMENT#heading | DOCUMENT> [--json]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      json: { type: "boolean", default: false },
    });
    const [ref] = positionals;
    if (ref === undefined) throw new TroveError("show what? pass an item id or a document name");

    const store = await openFromFlags(values, io);
    const found = excerpts(store.index, ref);
    io.print(values.json ? JSON.stringify(found, null, 2) : formatExcerpts(found));
    return EXIT.ok;
  },
};
