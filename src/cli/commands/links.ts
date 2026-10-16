import { relative, resolve } from "node:path";
import { resolveLinks } from "../../core/index/links.ts";
import { pinDeadLinks } from "../../core/ops/links-pin.ts";
import { toPosix } from "../../core/store/paths.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { plural } from "../format/plural.ts";
import { painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";
import { OP_OPTIONS, runPlan } from "../ops.ts";
import { openFromFlags } from "../store.ts";

const STATE_STYLE = { ok: "green", dead: "red", unchecked: "dim", unmerged: "yellow" } as const;

export const links: Command = {
  name: "links",
  summary: "List relative links to documents and code, or only the dead ones; pin deleted code",
  usage: "trove links [file] [--dead] [--json] [--fix [--dry-run]]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...OP_OPTIONS,
      dead: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
    });
    const store = await openFromFlags(values, io);
    const [file] = positionals;
    const only =
      file === undefined ? undefined : toPosix(relative(store.root, resolve(io.cwd, file)));
    const docs = store.index.documents.filter((doc) => only === undefined || doc.rel === only);
    const paint = painter(io);

    if (values.fix) {
      const plan = await pinDeadLinks(store.index, docs);
      if (plan.changes.length > 0) return runPlan(store, plan, io, values["dry-run"]);
      for (const note of plan.notes) io.print(paint("dim", `  ${note}`));
      io.print("nothing to pin");
      return EXIT.ok;
    }

    const all = docs.flatMap((doc) => resolveLinks(store.index, doc));
    const found = all.filter((link) => !values.dead || link.state === "dead");
    if (values.json) {
      io.print(JSON.stringify(found, null, 2));
    } else {
      const rows = found.map((link) => [
        `${link.file}:${link.line}`,
        paint(STATE_STYLE[link.state], link.state),
        link.kind,
        link.pin ? `${link.target} (${link.pin.note} ${link.pin.commit})` : link.target,
      ]);
      for (const line of formatTable(rows)) io.print(line);
      io.print(
        values.dead
          ? `${found.length} dead of ${plural(all.length, "link")}`
          : plural(found.length, "link"),
      );
    }
    return values.dead && found.length > 0 ? EXIT.failed : EXIT.ok;
  },
};
