import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { CONFIG_FILE } from "../config/load.ts";
import { TroveError } from "../errors.ts";
import { isInside, realPath } from "../text/real-path.ts";
import { toPosix } from "./paths.ts";
import { entryRoot, POINTER_FILE, readPointer } from "./pointer.ts";
import { readRegistry } from "./registry.ts";

type Candidate = { name: string; root: string; scope?: readonly string[] | undefined };

/** The nearest folder at or above `from` that holds `file`. */
export const findUp = (from: string, file: string): string | undefined => {
  const parent = dirname(from);
  if (existsSync(join(from, file))) return from;
  return parent === from ? undefined : findUp(parent, file);
};

const inScope = (candidate: Candidate, rel: string): boolean =>
  (candidate.scope ?? []).some((pattern) => {
    const glob = new Bun.Glob(pattern);
    return glob.match(rel) || glob.match(`${rel}/-`);
  });

const present = (candidate: Candidate): string => {
  if (!existsSync(join(candidate.root, CONFIG_FILE))) {
    throw new TroveError(`store ${candidate.name} is not at ${candidate.root}: run trove clone`);
  }
  return candidate.root;
};

/** The only store, or the one whose scope covers the folder the command runs from. */
const pick = (candidates: readonly Candidate[], rel: string): string => {
  const [only] = candidates;
  if (only && candidates.length === 1) return present(only);
  const scoped = candidates.filter((candidate) => inScope(candidate, rel));
  const [match] = scoped;
  if (match && scoped.length === 1) return present(match);
  const names = candidates.map((candidate) => candidate.name).join(", ");
  throw new TroveError(`this project has several stores (${names}): pass --store <name>`);
};

const projectCandidates = async (projectRoot: string): Promise<Candidate[]> => {
  const pointer = await readPointer(projectRoot);
  return (pointer?.stores ?? []).map((entry) => ({
    name: entry.name,
    root: entryRoot(projectRoot, entry),
    scope: entry.scope,
  }));
};

const fromRegistry = async (cwd: string): Promise<string | undefined> => {
  const project = (await readRegistry()).projects.find((entry) => isInside(entry.root, cwd));
  if (!project) return undefined;
  const candidates = project.stores.map((store) => ({ name: store.name, root: store.path }));
  return pick(candidates, toPosix(relative(realPath(project.root), realPath(cwd))));
};

/** `--store` (a store name, else a path), a store folder above `cwd`, `.trove.yaml`, the registry. */
export const locateStore = async (cwd: string, store?: string): Promise<string | undefined> => {
  const projectRoot = findUp(cwd, POINTER_FILE);
  const candidates = projectRoot ? await projectCandidates(projectRoot) : [];
  if (store !== undefined) {
    const named = candidates.find((candidate) => candidate.name === store);
    return named ? present(named) : resolve(cwd, store);
  }
  const inStore = findUp(cwd, CONFIG_FILE);
  if (inStore) return inStore;
  if (projectRoot && candidates.length > 0) {
    return pick(candidates, toPosix(relative(realPath(projectRoot), realPath(cwd))));
  }
  return fromRegistry(cwd);
};
