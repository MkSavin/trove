import { homedir } from "node:os";
import { join } from "node:path";
import { toPosix } from "../../core/store/paths.ts";
import { realPath } from "../../core/text/real-path.ts";
import { SERVER } from "../clients.ts";
import {
  formatJson,
  type McpJson,
  parseJson,
  readText,
  replaceFile,
  withServer,
} from "../config-files.ts";
import type { Installed } from "../install.ts";
import { SKILLS } from "../skills.ts";

export type ClaudeUserPaths = { config: string; skillsDir: string };

/** Claude Code moves both under `$CLAUDE_CONFIG_DIR` when it is set. */
export const claudeUserPaths = (
  env: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): ClaudeUserPaths => {
  const configDir = env.CLAUDE_CONFIG_DIR;
  return configDir
    ? { config: join(configDir, ".claude.json"), skillsDir: join(configDir, "skills") }
    : { config: join(home, ".claude.json"), skillsDir: join(home, ".claude", "skills") };
};

/** Claude Code keys projects by their root with forward slashes, also on Windows. */
export const projectKey = (projectRoot: string): string => toPosix(projectRoot);

type ClaudeJson = { projects?: Record<string, McpJson> };

const LOCAL_SERVER = { type: "stdio", ...SERVER };

const addLocalServer = (config: ClaudeJson, key: string): ClaudeJson => {
  const projects = config.projects ?? {};
  return {
    ...config,
    projects: { ...projects, [key]: withServer(projects[key] ?? {}, LOCAL_SERVER) },
  };
};

/** What `claude mcp add --scope local` does, plus the skills in the user's own folder. */
export const installClaudeLocal = async (
  projectRoot: string,
  paths: ClaudeUserPaths = claudeUserPaths(),
): Promise<Installed> => {
  const configPath = realPath(paths.config);
  const config = parseJson<ClaudeJson>(await readText(configPath), paths.config);
  await replaceFile(configPath, formatJson(addLocalServer(config, projectKey(projectRoot))));

  const skills = Object.entries(SKILLS).map(([name, text]) => ({
    path: join(paths.skillsDir, name, "SKILL.md"),
    text,
  }));
  await Promise.all(skills.map(({ path, text }) => Bun.write(path, text)));
  return { client: "claude", files: [paths.config, ...skills.map((skill) => skill.path)] };
};
