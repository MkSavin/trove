import { TroveError } from "../../core/errors.ts";
import { regulation, TOPICS, type Topic } from "../../core/regulation/regulation.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { openFromFlags } from "../store.ts";

const isTopic = (value: string | undefined): value is Topic =>
  TOPICS.some((topic) => topic === value);

export const regulationCommand: Command = {
  name: "regulation",
  summary: "Print how this store works, generated from its config",
  usage: `trove regulation <${TOPICS.join("|")}>`,
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, STORE_OPTIONS);
    const [topic] = positionals;
    if (!isTopic(topic)) throw new TroveError(`regulation of what? ${TOPICS.join(", ")}`);
    const store = await openFromFlags(values, io);
    io.write(regulation(store.config, store.rules, topic));
    return EXIT.ok;
  },
};
