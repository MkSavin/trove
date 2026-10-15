import { CLIENTS, type ClientName, isClient } from "../../clients/clients.ts";
import { installClient } from "../../clients/install.ts";
import { assertLocal, installLocal } from "../../clients/local.ts";
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

export type AddOptions = { local?: boolean };

/** Installs into the project root and prints what was written; with `local`, nothing goes into the project. */
export const addClients = async (
  clients: readonly ClientName[],
  io: Io,
  { local = false }: AddOptions = {},
): Promise<void> => {
  if (local) clients.forEach(assertLocal);
  const root = (await toplevel(io.cwd)) ?? io.cwd;
  const paint = painter(io);
  for (const client of clients) {
    const installed = local ? await installLocal(root, client) : await installClient(root, client);
    const label = local ? `${client}, this machine only` : client;
    io.print(paint("green", `✔ ${label}: ${installed.files.join(", ")}`));
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
  summary:
    "Register the MCP server and the skills for an assistant in this project, or on this machine only",
  usage: `trove client add <${CLIENTS.join("|")}>... [--local]`,
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, { local: { type: "boolean", default: false } });
    if (positionals.length === 0) throw new TroveError(`client add which? ${CLIENTS.join(", ")}`);
    await addClients(parseClients(positionals), io, { local: values.local });
    return EXIT.ok;
  },
};

export const client = defineGroup("client", "Connect assistants: Claude Code, Cursor, Codex", [
  clientAdd,
]);
