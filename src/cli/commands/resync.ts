import { resolve } from "node:path";
import { continueResync, resyncStore } from "../../core/migrate/resync.ts";
import { sealSource } from "../../core/migrate/seal.ts";
import { pushStore } from "../../core/sync/sync.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { type Paint, painter } from "../format/style.ts";
import { printSync } from "../format/sync.ts";
import { formatTable } from "../format/table.ts";
import type { Io } from "../io.ts";
import { openFromFlags } from "../store.ts";

const OUTCOME_STYLE = {
  applied: "green",
  moved: "green",
  conflict: "red",
  skipped: "dim",
} as const;

const seal = async (root: string, io: Io, paint: Paint): Promise<number> => {
  const sealed = await sealSource(root);
  const committed = sealed.commit ? `, committed ${sealed.commit}` : "";
  io.print(paint("green", `✔ sealed ${sealed.source}: ${sealed.files.join(", ")}${committed}`));
  return EXIT.ok;
};

export const resync: Command = {
  name: "resync",
  summary:
    "Bring changes made in the migrated-from archive into the store, keeping the store's own",
  usage: "trove resync [--source DIR] [--continue] [--seal]",
  run: async (argv, io) => {
    const { values } = parse(argv, {
      ...STORE_OPTIONS,
      source: { type: "string" },
      continue: { type: "boolean", default: false },
      seal: { type: "boolean", default: false },
    });
    const store = await openFromFlags(values, io);
    const result = values.continue
      ? await continueResync(store)
      : await resyncStore(store, values.source ? resolve(io.cwd, values.source) : undefined);
    const paint = painter(io);

    if (result.upToDate) {
      io.print(paint("green", `✔ up to date with ${result.source}`));
      return values.seal ? seal(store.root, io, paint) : EXIT.ok;
    }
    const rows = result.files.map((file) => [
      paint(OUTCOME_STYLE[file.outcome], file.outcome),
      file.path,
      file.detail ?? "",
    ]);
    for (const line of formatTable(rows)) io.print(`  ${line}`);
    if (!result.commit) {
      const then = values.seal ? "trove resync --continue --seal" : "trove resync --continue";
      io.print(paint("yellow", `conflicts left in place: resolve them, then ${then}`));
      return EXIT.failed;
    }
    io.print(paint("green", `✔ committed ${result.commit}`));
    const pushed = await pushStore(store);
    if (pushed.pushed) io.print(paint("dim", "  pushed"));
    printSync(pushed, io);
    return values.seal ? seal(store.root, io, paint) : EXIT.ok;
  },
};
