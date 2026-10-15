import { rename } from "node:fs/promises";
import { TroveError } from "../core/errors.ts";
import { SERVER, SERVER_NAME } from "./clients.ts";

export type McpJson = { mcpServers?: Record<string, unknown> };

export const readText = async (path: string): Promise<string | undefined> => {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : undefined;
};

export const parseJson = <Shape extends object>(
  text: string | undefined,
  origin: string,
): Shape => {
  try {
    return text ? (JSON.parse(text) as Shape) : ({} as Shape);
  } catch {
    throw new TroveError(`${origin} is not valid JSON: fix it or remove it first`);
  }
};

export const formatJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Adds or replaces the trove entry and keeps every other server as it was. */
export const withServer = <Config extends McpJson>(config: Config, server: object): Config => ({
  ...config,
  mcpServers: { ...config.mcpServers, [SERVER_NAME]: server },
});

export const mergeJson = (existing: string | undefined, origin: string): string =>
  formatJson(withServer(parseJson<McpJson>(existing, origin), SERVER));

const TOML_TABLE = `[mcp_servers.${SERVER_NAME}]`;

export const mergeToml = (existing: string | undefined): string | undefined => {
  if (existing?.includes(TOML_TABLE)) return undefined;
  const block = `${TOML_TABLE}\ncommand = "${SERVER.command}"\nargs = [${SERVER.args.map((a) => `"${a}"`).join(", ")}]\n`;
  if (!existing) return block;
  return `${existing.trimEnd()}\n\n${block}`;
};

/** Another program may read the file at any moment: it sees the old text or the new, never half. */
export const replaceFile = async (path: string, text: string): Promise<void> => {
  const temp = `${path}.trove-${process.pid}.tmp`;
  await Bun.write(temp, text);
  await rename(temp, path);
};
