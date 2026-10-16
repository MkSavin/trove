import { cloneStore, cloneStores } from "../../core/store/clone.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { formatTable } from "../format/table.ts";

export const clone: Command = {
  name: "clone",
  summary: "Clone and link a store by its address, or the stores the project names",
  usage: "trove clone [<store-url> [--path DIR] [--name NAME] [--share]]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      path: { type: "string" },
      name: { type: "string" },
      share: { type: "boolean", default: false },
    });
    const [remote] = positionals;
    const results = remote
      ? [await cloneStore({ cwd: io.cwd, remote, ...values })]
      : await cloneStores(io.cwd);
    for (const line of formatTable(results.map((r) => [r.name, r.action, r.root]))) io.print(line);
    return EXIT.ok;
  },
};
