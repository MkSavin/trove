import type { McpServer } from "@modelcontextprotocol/server";
import { openConfig } from "../core/store/open.ts";
import { uncommittedPaths } from "../core/sync/uncommitted.ts";
import type { Context } from "./context.ts";
import type { ToolResult } from "./respond.ts";

const STATUS_TTL_MS = 10_000;
const PATHS_SHOWN = 3;

type Status = { at: number; paths: readonly string[] };
type Handler = (args: { store?: string }, extra: unknown) => Promise<ToolResult>;
type ToolConfig = { annotations?: { readOnlyHint?: boolean } };
type Register = (name: string, config: ToolConfig, handler: Handler) => unknown;

const noticeText = (paths: readonly string[]): string => {
  const shown = paths.slice(0, PATHS_SHOWN).join(", ");
  const more = paths.length > PATHS_SHOWN ? ` and ${paths.length - PATHS_SHOWN} more` : "";
  const files = paths.length === 1 ? "file" : "files";
  return `trove: ${paths.length} uncommitted ${files} in the store (${shown}${more}). Run trove_check, then trove_sync before finishing.`;
};

const createNotices = (context: Context) => {
  const statuses = new Map<string, Status>();
  const ttl = context.statusTtlMs ?? STATUS_TTL_MS;

  const pathsOf = async (root: string, fresh: boolean): Promise<readonly string[]> => {
    const known = statuses.get(root);
    if (known && !fresh && Date.now() - known.at < ttl) return known.paths;
    const paths = await uncommittedPaths(root);
    statuses.set(root, { at: Date.now(), paths });
    return paths;
  };

  /** Never throws: a notice is a courtesy and must not cost the tool its answer. */
  return async (store: string | undefined, fresh: boolean): Promise<string | undefined> => {
    try {
      const { root, config } = await openConfig({ cwd: context.cwd, store, cache: context.cache });
      if (config.sync === "off") return undefined;
      const paths = await pathsOf(root, fresh);
      return paths.length > 0 ? noticeText(paths) : undefined;
    } catch {
      return undefined;
    }
  };
};

/** Every tool registered on `server` from here on reports a store left with uncommitted changes. */
export const addStoreNotices = (server: McpServer, context: Context): void => {
  const noticeFor = createNotices(context);
  const register = server.registerTool.bind(server) as Register;
  const wrapped: Register = (name, config, handler) =>
    register(name, config, async (args, extra) => {
      const result = await handler(args, extra);
      // A tool that may have just committed must not be answered from a stale status.
      const notice = await noticeFor(args.store, config.annotations?.readOnlyHint !== true);
      if (!notice) return result;
      return { ...result, content: [...result.content, { type: "text", text: notice }] };
    });
  server.registerTool = wrapped as typeof server.registerTool;
};
