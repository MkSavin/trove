import { serveStdio } from "../../mcp/server.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";

export const mcp: Command = {
  name: "mcp",
  summary: "Run the MCP server over stdio for the stores of the current folder",
  usage: "trove mcp",
  run: async (argv, io) => {
    parse(argv, {});
    await serveStdio({ cwd: io.cwd });
    return EXIT.ok;
  },
};
