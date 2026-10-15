import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_FILE, parseConfig } from "../config/load.ts";
import type { Config } from "../config/schema.ts";
import { TroveError } from "../errors.ts";

export type Scaffold = {
  project: string;
  /** From the store to the project, for `roots:` and the notes. */
  projectPath: string;
  configText: string;
};

const KEEP = ".gitkeep";

const agentsNotes = ({ project, projectPath }: Scaffold): string => `# ${project} — store notes

This folder is a trove store: audits, plans, specs and research for \`${project}\`.
The rules live in \`${CONFIG_FILE}\` and in the trove README; keep only local facts here.

| what | where |
| ---- | ----- |
| code | \`${projectPath}\` |
| check | \`trove check\`, also run by the pre-commit hook |
| what is left | \`BACKLOG.md\`, rebuilt by \`trove report\` and by every \`trove item\` command |

## What goes where

Built from the types in \`${CONFIG_FILE}\`; edit their \`purpose\` there, not this table.

<!-- regulation:placement -->
<!-- /regulation:placement -->
`;

const gitAttributes = (config: Config): string =>
  `${Object.values(config.reports)
    .map((report) => `${report.output} merge=ours`)
    .join("\n")}\n`;

const ensureEmpty = async (root: string): Promise<void> => {
  const entries = await readdir(root).catch(() => []);
  if (entries.length > 0) throw new TroveError(`${root} exists and is not empty`);
};

/** Points `roots:` at the project so code links resolve. */
export const withProjectRoot = (configText: string, project: string, projectPath: string): string =>
  configText.replace(/^roots: \{\}$/m, `roots:\n  ${project}: ${projectPath}`);

/** Folders, config, notes and git files of a new store; reports are built afterwards. */
export const writeScaffold = async (root: string, scaffold: Scaffold): Promise<Config> => {
  await ensureEmpty(root);
  const config = parseConfig(scaffold.configText, CONFIG_FILE);
  await Promise.all(
    Object.keys(config.folders).map(async (folder) => {
      await mkdir(join(root, folder), { recursive: true });
      await Bun.write(join(root, folder, KEEP), "");
    }),
  );
  await Bun.write(join(root, CONFIG_FILE), scaffold.configText);
  await Bun.write(join(root, "AGENTS.md"), agentsNotes(scaffold));
  await Bun.write(join(root, ".gitignore"), ".trove/cache/\n");
  await Bun.write(join(root, ".gitattributes"), gitAttributes(config));
  return config;
};
