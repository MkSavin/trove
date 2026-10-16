import { join, resolve } from "node:path";
import { CONFIG_FILE, loadConfig } from "../config/load.ts";
import type { Config } from "../config/schema.ts";
import { TroveError } from "../errors.ts";
import { buildIndex, type StoreIndex } from "../index/index.ts";
import { withStoreGitData } from "../live/git-data.ts";
import { builtinRules } from "../rules/builtin/index.ts";
import { loadPluginRules, mergeRules } from "../rules/plugins.ts";
import type { Rule } from "../rules/rule.ts";
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
};

const resolveRoot = async ({ cwd, store, config }: OpenOptions): Promise<string> => {
  const root = (await locateStore(cwd, store)) ?? (config ? cwd : undefined);
  if (root === undefined) {
    throw new TroveError(`no ${CONFIG_FILE} in ${cwd} or above: pass --store or run trove init`);
  }
  return root;
};

export const openStore = async (options: OpenOptions): Promise<Store> => {
  const root = await resolveRoot(options);
  const configPath = options.config
    ? resolve(options.cwd, options.config)
    : join(root, CONFIG_FILE);
  const config = await loadConfig(configPath);
  const rules = mergeRules(builtinRules, await loadPluginRules(root, config.plugins));
  const index = await withStoreGitData(await buildIndex(root, config, options.today));
  return { root, configPath, config, rules, index };
};
