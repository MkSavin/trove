import { join } from "node:path";
import { TroveError } from "../core/errors.ts";
import { type ClientName, LAYOUTS, SERVER, SERVER_NAME } from "./clients.ts";
import { SKILLS } from "./skills.ts";

export type Installed = { client: ClientName; files: readonly string[] };

const readText = async (path: string): Promise<string | undefined> => {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : undefined;
};

type McpJson = { mcpServers?: Record<string, unknown> };

const parseJson = (text: string | undefined, origin: string): McpJson => {
  try {
    return text ? (JSON.parse(text) as McpJson) : {};
  } catch {
    throw new TroveError(`${origin} is not valid JSON: fix it or remove it first`);
  }
};

/** Adds or replaces the trove entry and keeps every other server as it was. */
const mergeJson = (existing: string | undefined, origin: string): string => {
  const config = parseJson(existing, origin);
  const merged = { ...config, mcpServers: { ...config.mcpServers, [SERVER_NAME]: SERVER } };
  return `${JSON.stringify(merged, null, 2)}\n`;
};

const TOML_TABLE = `[mcp_servers.${SERVER_NAME}]`;

const mergeToml = (existing: string | undefined): string | undefined => {
  if (existing?.includes(TOML_TABLE)) return undefined;
  const block = `${TOML_TABLE}\ncommand = "${SERVER.command}"\nargs = [${SERVER.args.map((a) => `"${a}"`).join(", ")}]\n`;
  if (!existing) return block;
  return `${existing.trimEnd()}\n\n${block}`;
};

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
