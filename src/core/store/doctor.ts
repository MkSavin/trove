import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { CONFIG_FILE } from "../config/load.ts";
import { git, toplevel } from "../git/git.ts";
import { type SourceHealth, sourceHealth } from "../migrate/drift.ts";
import { runRules } from "../rules/run.ts";
import { isInside, samePath } from "../text/real-path.ts";
import { findUp } from "./locate.ts";
import { openStore } from "./open.ts";
import { entryRoot, POINTER_FILE, type PointerPlace, readPointer } from "./pointer.ts";
import { findProject, readRegistry } from "./registry.ts";
import { archiveIgnored } from "./search-ignore.ts";
import { siblingStores } from "./siblings.ts";

export type StoreHealth = {
  name: string;
  root: string;
  present: boolean;
  remote: string | undefined;
  sync: string | undefined;
  documents: number | undefined;
  errors: number | undefined;
  problem: string | undefined;
  source: SourceHealth | undefined;
  /** Whether `.ignore` keeps the archive out of ripgrep-style searches. */
  archiveIgnored: boolean | undefined;
};

type StoreEntry = { name: string; root: string };

type FoundStores = {
  project: string;
  /** Where the project names its stores: `.trove.yaml`, `.git/trove.yaml`, or nowhere. */
  pointer: PointerPlace | undefined;
  registered: boolean;
  entries: readonly StoreEntry[];
};

export type Health = Omit<FoundStores, "entries"> & { stores: readonly StoreHealth[] };

const inspect = async ({ name, root }: StoreEntry): Promise<StoreHealth> => {
  const blank = {
    name,
    root,
    remote: undefined,
    sync: undefined,
    documents: undefined,
    errors: undefined,
    source: undefined,
    archiveIgnored: undefined,
  };
  if (!existsSync(join(root, CONFIG_FILE)))
    return { ...blank, present: false, problem: "not on this machine: run trove clone" };
  try {
    const store = await openStore({ cwd: root, store: root });
    const remote = await git(root, ["remote", "get-url", "origin"]);
    return {
      ...blank,
      present: true,
      remote: remote.ok ? remote.out : undefined,
      sync: store.config.sync,
      documents: store.index.documents.length,
      errors: runRules(store.rules, store.index).filter((d) => d.severity === "error").length,
      problem: undefined,
      source: await sourceHealth(root),
      archiveIgnored: await archiveIgnored(root, store.config),
    };
  } catch (error) {
    return { ...blank, present: true, problem: (error as Error).message };
  }
};

/** Inside a store with no pointer above: the project the registry ties it to, else the store alone. */
const fromStore = async (store: string): Promise<FoundStores> => {
  const project = (await readRegistry()).projects.find((entry) =>
    entry.stores.some((candidate) => samePath(candidate.path, store)),
  );
  return {
    project: project?.root ?? store,
    pointer: undefined,
    registered: project !== undefined,
    entries: project?.stores.map((entry) => ({ name: entry.name, root: entry.path })) ?? [
      { name: basename(store), root: store },
    ],
  };
};

/** Every store this folder can reach, without opening any of them. */
export const findStores = async (cwd: string): Promise<FoundStores> => {
  const store = findUp(cwd, CONFIG_FILE);
  const pointed = findUp(cwd, POINTER_FILE);
  if (store && (!pointed || isInside(store, pointed))) return fromStore(store);
  const project = pointed ?? (await toplevel(cwd)) ?? cwd;
  const pointer = await readPointer(project);
  const registered = await findProject(project);
  return {
    project,
    pointer: pointer?.place,
    registered: registered !== undefined,
    entries: pointer
      ? pointer.stores.map((entry) => ({ name: entry.name, root: entryRoot(project, entry) }))
      : (registered?.stores.map((store) => ({ name: store.name, root: store.path })) ??
        (await siblingStores(project))),
  };
};

/** Everything `trove doctor` prints, gathered without changing anything. */
export const diagnose = async (cwd: string): Promise<Health> => {
  const { entries, ...found } = await findStores(cwd);
  return { ...found, stores: await Promise.all(entries.map(inspect)) };
};
