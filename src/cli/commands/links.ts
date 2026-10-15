import { relative, resolve } from "node:path";
import { resolveLinks } from "../../core/index/links.ts";
import { toPosix } from "../../core/store/paths.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";
import { openFromFlags } from "../store.ts";

const STATE_STYLE = { ok: "green", dead: "red", unchecked: "dim" } as const;

export const links: Command = {
  name: "links",
  summary: "List relative links to documents and code, or only the dead ones",
  usage: "trove links [file] [--dead] [--json]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      dead: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    });
    const store = await openFromFlags(values, io);
    const [file] = positionals;
    const only =
      file === undefined ? undefined : toPosix(relative(store.root, resolve(io.cwd, file)));
    const found = store.index.documents
      .filter((doc) => only === undefined || doc.rel === only)
      .flatMap((doc) => resolveLinks(store.index, doc))
      .filter((link) => !values.dead || link.state === "dead");

    if (values.json) {
      io.print(JSON.stringify(found, null, 2));
    } else {
      const paint = painter(io);
      const rows = found.map((link) => [
        `${link.file}:${link.line}`,
        paint(STATE_STYLE[link.state], link.state),
        link.kind,
        link.target,
      ]);
      for (const line of formatTable(rows)) io.print(line);
      io.print(`${found.length} links`);
    }
    return values.dead && found.length > 0 ? EXIT.failed : EXIT.ok;
  },
};
