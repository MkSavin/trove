import { syncStore } from "../../core/sync/sync.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { printSync } from "../format/sync.ts";
import { openFromFlags } from "../store.ts";

export const sync: Command = {
  name: "sync",
  summary: "Commit hand edits with rebuilt reports, then push by the store's sync mode",
  usage: "trove sync [--message TEXT]",
  run: async (argv, io) => {
    const { values } = parse(argv, { ...STORE_OPTIONS, message: { type: "string", short: "m" } });
    const store = await openFromFlags(values, io);
    const result = await syncStore(store, values.message);
    if (!result.commit && result.warnings.length === 0) io.print("nothing to commit");
    printSync(result, io);
    return result.warnings.length > 0 ? EXIT.failed : EXIT.ok;
  },
};
