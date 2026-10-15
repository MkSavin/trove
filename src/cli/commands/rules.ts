import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { formatTable } from "../format/table.ts";
import { openFromFlags } from "../store.ts";

export const rules: Command = {
  name: "rules",
  summary: "List the rules this store runs, with their effective level",
  usage: "trove rules",
  run: async (argv, io) => {
    const { values } = parse(argv, STORE_OPTIONS);
    const store = await openFromFlags(values, io);
    const rows = store.rules.map((rule) => {
      const setting = store.config.rules[rule.id];
      const since = setting?.since ? ` since ${setting.since}` : "";
      return [rule.id, `${setting?.level ?? rule.level}${since}`, rule.summary];
    });
    for (const line of formatTable([["rule", "level", "checks"], ...rows])) io.print(line);
    return EXIT.ok;
  },
};
