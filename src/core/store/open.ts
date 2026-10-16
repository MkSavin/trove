import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONFIG_FILE, parseConfig, readConfigText } from "../config/load.ts";
import type { Config } from "../config/schema.ts";
import { TroveError } from "../errors.ts";
import { buildIndex, type StoreIndex } from "../index/index.ts";
import { withStoreGitData } from "../live/git-data.ts";
import { builtinRules } from "../rules/builtin/index.ts";
import { loadPluginRules, mergeRules } from "../rules/plugins.ts";
import type { Rule } from "../rules/rule.ts";
import { reusable, type StoreCache } from "./cache.ts";
import { locateStore } from "./locate.ts";

export type Store = {
  root: string;
  configPath: string;
  config: Config;
  rules: readonly Rule[];
  index: StoreIndex;
};

export type OpenOptions = {
  cwd: string;
  /** Store name or folder; found from `cwd` when omitted. */
  store?: string | undefined;
  /** Config file; `<store>/trove.yaml` when omitted. */
  config?: string | undefined;
  today?: string | undefined;
  /** Kept by a long-running process such as the MCP server. */
  cache?: StoreCache | undefined;
};

const locateRoot = async ({ cwd, store, config }: OpenOptions): Promise<string> => {
  const root = (await locateStore(cwd, store)) ?? (config ? cwd : undefined);
  if (root === undefined) {
    throw new TroveError(`no ${CONFIG_FILE} in ${cwd} or above: pass --store or run trove init`);
  }
  return root;
};

/** A cached root is trusted while its config file is still there. */
const resolveRoot = async (options: OpenOptions): Promise<string> => {
  const key = [options.cwd, options.store ?? "", options.config ?? ""].join("\0");
  const known = options.cache?.roots.get(key);
  if (known && existsSync(join(known, CONFIG_FILE))) return known;
  const root = await locateRoot(options);
  options.cache?.roots.set(key, root);
  return root;
};

const readConfig = async (path: string, cache: StoreCache | undefined): Promise<Config> => {
  const text = await readConfigText(path);
  const known = cache?.configs.get(path);
  if (known?.text === text) return known.config;
  const config = parseConfig(text, path);
  cache?.configs.set(path, { text, config });
  return config;
};

export const openStore = async (options: OpenOptions): Promise<Store> => {
  const { cache } = options;
  const root = await resolveRoot(options);
  const configPath = options.config
    ? resolve(options.cwd, options.config)
    : join(root, CONFIG_FILE);
  const config = await readConfig(configPath, cache);
  const rules = mergeRules(builtinRules, await loadPluginRules(root, config.plugins));
  const built = await buildIndex(root, config, options.today, reusable(cache, root, config));
  cache?.documents.set(root, { config, byRel: built.byRel });
  const index = await withStoreGitData(built);
  return { root, configPath, config, rules, index };
};
