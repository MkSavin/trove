export const CLIENTS = ["claude", "cursor", "codex"] as const;
export type ClientName = (typeof CLIENTS)[number];

export type ClientLayout = {
  /** Project-relative file that registers MCP servers. */
  mcpFile: string;
  mcpFormat: "json" | "toml";
  /** Project-relative folder of agent skills. */
  skillsDir: string;
};

export const LAYOUTS: Readonly<Record<ClientName, ClientLayout>> = {
  claude: { mcpFile: ".mcp.json", mcpFormat: "json", skillsDir: ".claude/skills" },
  cursor: { mcpFile: ".cursor/mcp.json", mcpFormat: "json", skillsDir: ".cursor/skills" },
  codex: { mcpFile: ".codex/config.toml", mcpFormat: "toml", skillsDir: ".agents/skills" },
};

export const isClient = (value: string): value is ClientName =>
  CLIENTS.some((client) => client === value);

export const SERVER_NAME = "trove";
export const SERVER = { command: "trove", args: ["mcp"] } as const;
