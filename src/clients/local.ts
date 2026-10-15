import { TroveError } from "../core/errors.ts";
import { installClaudeLocal } from "./claude/local.ts";
import { type ClientName, LAYOUTS } from "./clients.ts";
import type { Installed } from "./install.ts";

const projectFolders = (client: ClientName): string => {
  const { mcpFile, skillsDir } = LAYOUTS[client];
  return [...new Set([mcpFile, skillsDir].map((path) => path.split("/")[0]))].join(" and ");
};

/** Throws for a client that keeps MCP servers either in the project or for every project. */
export const assertLocal = (client: ClientName): void => {
  if (client === "claude") return;
  throw new TroveError(
    `${client} has no per-user config for one project, so --local cannot keep it out of the project: ` +
      `run without --local and add ${projectFolders(client)} to .git/info/exclude so git ignores them on this machine`,
  );
};

/** Registers the client for this project on this machine only, writing nothing into the project. */
export const installLocal = (projectRoot: string, client: ClientName): Promise<Installed> => {
  assertLocal(client);
  return installClaudeLocal(projectRoot);
};
