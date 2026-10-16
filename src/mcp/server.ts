import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import packageJson from "../../package.json" with { type: "json" };
import { createStoreCache } from "../core/store/cache.ts";
import type { Context } from "./context.ts";
import { registerResources } from "./resources.ts";
import { registerEditTools } from "./tools/edit.ts";
import { registerMaintenanceTools } from "./tools/maintain.ts";
import { registerReadTools } from "./tools/read.ts";

const INSTRUCTIONS = `trove keeps a project's audits, plans, specs and research as Markdown in a git store.
Read with trove_query and trove_show instead of opening whole files; edit only through trove_create, trove_update, trove_transition and trove_item, which patch their own lines, refuse changes that add errors and rebuild reports.
Start with trove_regulation topic=workflow. Pass store only when the project has several stores.`;

export const createServer = (context: Context): McpServer => {
  const server = new McpServer(
    { name: "trove", version: packageJson.version },
    { instructions: INSTRUCTIONS },
  );
  const shared: Context = { cache: createStoreCache(), ...context };
  registerReadTools(server, shared);
  registerEditTools(server, shared);
  registerMaintenanceTools(server, shared);
  registerResources(server, shared);
  return server;
};

/** Serves the stores of the client's working folder over stdio until the client hangs up. */
export const serveStdio = async (context: Context): Promise<void> => {
  await createServer(context).connect(new StdioServerTransport());
};
