import { TroveError } from "../core/errors.ts";
import { installClaudeLocal } from "./claude/local.ts";
import { type ClientName, LAYOUTS } from "./clients.ts";
import type { Installed } from "./install.ts";
import { installKimiLocal } from "./kimi/local.ts";

const LOCAL_INSTALLERS: Partial<Record<ClientName, (projectRoot: string) => Promise<Installed>>> = {
  claude: (projectRoot) => installClaudeLocal(projectRoot),
  kimi: () => installKimiLocal(),
};

const projectFolders = (client: ClientName): string => {
  const { mcpFile, skillsDir } = LAYOUTS[client];
  return [...new Set([mcpFile, skillsDir].map((path) => path.split("/")[0]))].join(" and ");
};

const installerFor = (client: ClientName): ((projectRoot: string) => Promise<Installed>) => {
  const installer = LOCAL_INSTALLERS[client];
  if (installer) return installer;
  throw new TroveError(
    `${client} has no per-user config for one project, so --local cannot keep it out of the project: ` +
      `run without --local and add ${projectFolders(client)} to .git/info/exclude so git ignores them on this machine`,
  );
};

/** Throws for a client whose servers can only live in the project. */
export const assertLocal = (client: ClientName): void => {
  installerFor(client);
};

/** Registers the client on this machine, writing nothing into the project. */
export const installLocal = (projectRoot: string, client: ClientName): Promise<Installed> =>
  installerFor(client)(projectRoot);
