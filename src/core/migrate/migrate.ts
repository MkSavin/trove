import { existsSync } from "node:fs";
import { appendFile, readdir, rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { CONFIG_FILE, parseConfig } from "../config/load.ts";
import { TroveError } from "../errors.ts";
import { git, gitOrThrow } from "../git/git.ts";
import { buildIndex } from "../index/index.ts";
import type { Language } from "../presets/presets.ts";
import { writeReports } from "../reports/write.ts";
import type { Diagnostic } from "../rules/diagnostic.ts";
import { runRules } from "../rules/run.ts";
import { prepareRepository } from "../store/hook.ts";
import { openStore } from "../store/open.ts";
import { toPosix } from "../store/paths.ts";
import { readPointer, writePointer } from "../store/pointer.ts";
import { registerProject } from "../store/registry.ts";
import { copySource } from "./copy.ts";
import { inferConfig } from "./infer.ts";
import { type Inventory, inventoryChanges, takeInventory } from "./inventory.ts";
import { recordOrigin } from "./origin.ts";
import { readSourceRemote, type SourceRemote } from "./source-remote.ts";

export type MigrateOptions = {
  cwd: string;
  source: string;
  target: string;
  language?: Language | undefined;
  /** Files of the old tooling to leave behind, e.g. a hand-written checker. */
  drop?: readonly string[] | undefined;
  /** Registers the store for this project folder; `link` also writes its `.trove.yaml`. */
  project?: string | undefined;
  link?: boolean | undefined;
  name?: string | undefined;
};

export type MigrateResult = {
  target: string;
  language: Language;
  history: boolean;
  uncommitted: readonly string[];
  dropped: readonly string[];
  notes: readonly string[];
  inventory: Inventory;
  /** Counts that differ between the copied archive and the store; empty when nothing was lost. */
  lost: readonly string[];
  diagnostics: readonly Diagnostic[];
  commits: readonly string[];
  /** The archive's origin, never set on the store: pushing there would publish the store over it. */
  sourceRemote: SourceRemote | undefined;
};

const ensureFreshTarget = async (target: string): Promise<void> => {
  const entries = await readdir(target).catch(() => []);
  if (entries.length > 0) throw new TroveError(`${target} exists and is not empty`);
};

const commit = async (root: string, message: string): Promise<string | undefined> => {
  await gitOrThrow(root, ["add", "--all"]);
  if ((await git(root, ["diff", "--cached", "--quiet"])).ok) return undefined;
  const done = await git(root, ["commit", "--quiet", "-m", message]);
  if (!done.ok) throw new TroveError(`commit in ${root} failed: ${done.err}`);
  return message.split("\n")[0];
};

const ensureLines = async (file: string, lines: readonly string[]): Promise<void> => {
  const handle = Bun.file(file);
  const text = (await handle.exists()) ? await handle.text() : "";
  const missing = lines.filter((line) => !text.split(/\r?\n/).includes(line));
  if (missing.length === 0) return;
  const gap = text === "" || text.endsWith("\n") ? "" : "\n";
  await appendFile(file, `${gap}${missing.join("\n")}\n`);
};

const linkProject = async (options: MigrateOptions, target: string): Promise<void> => {
  if (!options.project) return;
  const project = resolve(options.cwd, options.project);
  const name = options.name ?? "main";
  await registerProject({ root: project, stores: [{ name, path: target }] });
  if (!options.link) return;
  const pointer = await readPointer(project);
  const others = (pointer?.stores ?? []).filter((store) => store.name !== name);
  await writePointer(project, {
    stores: [...others, { name, path: toPosix(relative(project, target)) }],
  });
};

const summary = (inventory: Inventory): string =>
  Object.entries(inventory)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

/**
 * Builds a new store from an existing archive: history and uncommitted work come along, the
 * config is fitted to the documents, reports are rebuilt. The source is only read.
 */
export const migrateArchive = async (options: MigrateOptions): Promise<MigrateResult> => {
  const source = resolve(options.cwd, options.source);
  const target = resolve(options.cwd, options.target);
  if (!existsSync(source)) throw new TroveError(`no archive at ${source}`);
  await ensureFreshTarget(target);

  const copied = await copySource(source, target);
  const commits: string[] = [];
  if (!copied.history) await gitOrThrow(target, ["init", "--quiet", "--initial-branch=main"]);
  const carried = await commit(
    target,
    copied.history
      ? `docs: uncommitted work from ${basename(source)} at migration`
      : `docs: import ${basename(source)}`,
  );
  if (carried) commits.push(carried);
  const sourceState = await gitOrThrow(target, ["rev-parse", "HEAD"]);

  const project = options.project ? resolve(options.cwd, options.project) : undefined;
  const roots = project ? { [basename(project)]: toPosix(relative(target, project)) } : {};
  const inferred = await inferConfig(target, options.language, roots);
  const before = takeInventory(await buildIndex(target, parseConfig(inferred.text, CONFIG_FILE)));
  const dropped = (options.drop ?? []).filter((file) => existsSync(join(target, file)));
  await Promise.all(dropped.map((file) => rm(join(target, file), { force: true })));
  await Bun.write(join(target, CONFIG_FILE), inferred.text);
  const config = parseConfig(inferred.text, CONFIG_FILE);
  await ensureLines(join(target, ".gitignore"), [".trove/cache/"]);
  await ensureLines(
    join(target, ".gitattributes"),
    Object.values(config.reports).map((report) => `${report.output} merge=ours`),
  );

  await writeReports(
    (await openStore({ cwd: target, store: target })).index,
    Object.keys(config.reports),
  );
  const store = await openStore({ cwd: target, store: target });
  const inventory = takeInventory(store.index);
  const migrated = await commit(
    target,
    `trove: migrate from ${basename(source)}\n\n${summary(inventory)}`,
  );
  if (migrated) commits.push(migrated);
  await prepareRepository(target);
  await recordOrigin(target, source, options.drop ?? [], sourceState);
  await linkProject(options, target);

  return {
    target,
    language: inferred.language,
    history: copied.history,
    uncommitted: copied.uncommitted,
    dropped,
    notes: inferred.notes,
    inventory,
    lost: inventoryChanges(before, inventory),
    diagnostics: runRules(store.rules, store.index),
    commits,
    sourceRemote: copied.history ? await readSourceRemote(source) : undefined,
  };
};
