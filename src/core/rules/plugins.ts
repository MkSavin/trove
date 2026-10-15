import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TroveError } from "../errors.ts";
import type { Rule } from "./rule.ts";

const SCRIPTS = new Bun.Glob("*.{ts,js}");

const isRule = (value: unknown): value is Rule =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  "scope" in value &&
  "check" in value &&
  typeof value.check === "function";

/** Each plugin module exports `rules`, an array of `defineRule(...)` results. */
export const loadPluginRules = async (root: string, dir: string | undefined): Promise<Rule[]> => {
  if (dir === undefined) return [];
  const folder = join(root, dir);
  if (!existsSync(folder)) throw new TroveError(`plugins folder ${dir} does not exist`);

  const files = (await Array.fromAsync(SCRIPTS.scan({ cwd: folder }))).sort();
  const modules: unknown[] = await Promise.all(
    files.map((file) => import(pathToFileURL(join(folder, file)).href)),
  );
  return modules.flatMap((module, i) => {
    const rules = (module as { rules?: unknown }).rules;
    if (!Array.isArray(rules) || !rules.every(isRule)) {
      throw new TroveError(`${dir}/${files[i]} must export rules: Rule[]`);
    }
    return rules;
  });
};

export const mergeRules = (builtin: readonly Rule[], extra: readonly Rule[]): Rule[] => {
  const taken = new Set(builtin.map((rule) => rule.id));
  const clash = extra.find((rule) => taken.has(rule.id));
  if (clash) throw new TroveError(`plugin rule ${clash.id} clashes with a built-in rule`);
  return [...builtin, ...extra];
};
