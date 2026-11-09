import { homedir } from "node:os";
import { join } from "node:path";
import { realPath } from "../../core/text/real-path.ts";
import { mergeJson, readText, replaceFile } from "../config-files.ts";
import type { Installed } from "../install.ts";
import { SKILLS } from "../skills.ts";

export const kimiHome = (
  env: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): string => env.KIMI_CODE_HOME || join(home, ".kimi-code");

/** Kimi Code's user level is the only place outside the project, so this reaches every project. */
export const installKimiLocal = async (home: string = kimiHome()): Promise<Installed> => {
  const mcpFile = join(home, "mcp.json");
  const mcpPath = realPath(mcpFile);
  await replaceFile(mcpPath, mergeJson(await readText(mcpPath), mcpFile));

  const skills = Object.entries(SKILLS).map(([name, text]) => ({
    path: join(home, "skills", name, "SKILL.md"),
    text,
  }));
  await Promise.all(skills.map(({ path, text }) => Bun.write(path, text)));
  return { client: "kimi", files: [mcpFile, ...skills.map((skill) => skill.path)] };
};
