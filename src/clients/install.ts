import { join } from "node:path";
import { type ClientName, LAYOUTS } from "./clients.ts";
import { mergeJson, mergeToml, readText } from "./config-files.ts";
import { SKILLS } from "./skills.ts";

/** `files` are project-relative for a project install and absolute for a local one. */
export type Installed = { client: ClientName; files: readonly string[] };

/** Registers the MCP server and writes the skills where the client looks for them. */
export const installClient = async (
  projectRoot: string,
  client: ClientName,
): Promise<Installed> => {
  const layout = LAYOUTS[client];
  const mcpPath = join(projectRoot, layout.mcpFile);
  const existing = await readText(mcpPath);
  const mcp =
    layout.mcpFormat === "json" ? mergeJson(existing, layout.mcpFile) : mergeToml(existing);
  if (mcp !== undefined && mcp !== existing) await Bun.write(mcpPath, mcp);

  const skills = Object.entries(SKILLS).map(([name, text]) => ({
    rel: `${layout.skillsDir}/${name}/SKILL.md`,
    text,
  }));
  await Promise.all(skills.map(({ rel, text }) => Bun.write(join(projectRoot, rel), text)));
  return { client, files: [layout.mcpFile, ...skills.map((skill) => skill.rel)] };
};
