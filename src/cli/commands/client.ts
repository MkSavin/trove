import { CLIENTS, type ClientName, isClient } from "../../clients/clients.ts";
import { installClient } from "../../clients/install.ts";
import { TroveError } from "../../core/errors.ts";
import { toplevel } from "../../core/git/git.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { painter } from "../format/style.ts";
import { defineGroup } from "../group.ts";
import type { Io } from "../io.ts";

export const parseClients = (names: readonly string[]): ClientName[] =>
  names.map((name) => {
    if (!isClient(name))
      throw new TroveError(`unknown client ${name}; one of ${CLIENTS.join(", ")}`);
    return name;
  });

/** Installs into the project root and prints what was written. */
export const addClients = async (clients: readonly ClientName[], io: Io): Promise<void> => {
  const root = (await toplevel(io.cwd)) ?? io.cwd;
  const paint = painter(io);
  for (const client of clients) {
    const installed = await installClient(root, client);
    io.print(paint("green", `✔ ${client}: ${installed.files.join(", ")}`));
  }
  if (clients.includes("claude")) {
    io.print(
      paint(
        "dim",
        "  Claude Code also has a plugin with hooks: /plugin marketplace add MkSavin/trove",
      ),
    );
  }
};

const clientAdd: Command = {
  name: "add",
  summary: "Register the MCP server and the skills for an assistant in this project",
  usage: `trove client add <${CLIENTS.join("|")}>...`,
  run: async (argv, io) => {
    const { positionals } = parse(argv, {});
    if (positionals.length === 0) throw new TroveError(`client add which? ${CLIENTS.join(", ")}`);
    await addClients(parseClients(positionals), io);
    return EXIT.ok;
  },
};

export const client = defineGroup("client", "Connect assistants: Claude Code, Cursor, Codex", [
  clientAdd,
]);
