import { cloneStores } from "../../core/store/clone.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { formatTable } from "../format/table.ts";

export const clone: Command = {
  name: "clone",
  summary: "Clone and register the stores named in the project's .trove.yaml",
  usage: "trove clone",
  run: async (argv, io) => {
    parse(argv, {});
    const results = await cloneStores(io.cwd);
    for (const line of formatTable(results.map((r) => [r.name, r.action, r.root]))) io.print(line);
    return EXIT.ok;
  },
};
