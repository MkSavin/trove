import { TroveError } from "../../core/errors.ts";
import { openStore } from "../../core/store/open.ts";
import { type ServeOptions, serveStore } from "../../serve/server.ts";
import { parse, positiveInteger, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { openFromFlags } from "../store.ts";

const DEFAULT_PORT = 7480;

const listen = (port: number, open: ServeOptions["open"]) => {
  try {
    return serveStore({ port, open });
  } catch (error) {
    throw new TroveError(`cannot listen on port ${port}: ${(error as Error).message}`);
  }
};

export const serve: Command = {
  name: "serve",
  summary: "Browse documents, items and summaries in a read-only page on 127.0.0.1",
  usage: `trove serve [--port N, default ${DEFAULT_PORT}]`,
  run: async (argv, io) => {
    const { values } = parse(argv, { ...STORE_OPTIONS, port: { type: "string" } });
    const port = positiveInteger("port", values.port) ?? DEFAULT_PORT;
    const { root, configPath } = await openFromFlags(values, io);
    const server = listen(port, async () => {
      const store = await openStore({ cwd: io.cwd, store: root, config: configPath });
      return store.index;
    });
    io.print(`serving ${root} at ${server.url} (read-only); Ctrl+C stops`);
    return EXIT.ok;
  },
};
