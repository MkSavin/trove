import { existsSync } from "node:fs";
import { join } from "node:path";
import { git, gitOrThrow } from "../git/git.ts";
import { readOrigin } from "./origin.ts";
import { sourceChanges, sourceFiles } from "./source-status.ts";

export type SourceHealth = {
  path: string;
  /** Missing when the source cannot be compared, e.g. it is not on this machine. */
  changed: boolean | undefined;
};

const QUIET = ["-c", "core.quotePath=false"];

const lines = (text: string): string[] => text.split("\n").filter(Boolean);

const blobAt = async (store: string, state: string, path: string) => {
  const found = await git(store, ["rev-parse", "--verify", "--quiet", `${state}:${path}`]);
  return found.ok ? found.out : undefined;
};

/** Hashed the way a snapshot hashes it, without writing anything. */
const blobIn = async (store: string, source: string, path: string) =>
  existsSync(join(source, path))
    ? gitOrThrow(store, ["hash-object", `--path=${path}`, join(source, path)])
    : undefined;

const differs = async (store: string, source: string, state: string, paths: string[]) => {
  for (const path of new Set(paths)) {
    if ((await blobAt(store, state, path)) !== (await blobIn(store, source, path))) return true;
  }
  return false;
};

/** Whether the source differs from the state the store last took in. Reads both, writes neither. */
export const sourceChangedSince = async (
  store: string,
  source: string,
  state: string,
): Promise<boolean> => {
  if (!existsSync(join(source, ".git"))) {
    const tracked = lines(
      await gitOrThrow(store, [...QUIET, "ls-tree", "-r", "--name-only", state]),
    );
    const present = (await sourceFiles(source)).map((file) => file.path);
    return differs(store, source, state, [...tracked, ...present]);
  }
  const head = await git(source, ["rev-parse", "HEAD"]);
  if (!head.ok || !(await git(store, ["cat-file", "-e", `${head.out}^{commit}`])).ok) return true;
  const sinceHead = lines(
    await gitOrThrow(store, [...QUIET, "diff", "--name-only", head.out, state]),
  );
  const uncommitted = (await sourceChanges(source)).map((change) => change.path);
  return differs(store, source, state, [...sinceHead, ...uncommitted]);
};

/** The migrated-from archive of a store and whether it moved on; missing for other stores. */
export const sourceHealth = async (store: string): Promise<SourceHealth | undefined> => {
  const origin = await readOrigin(store).catch(() => undefined);
  if (!origin) return undefined;
  const changed = existsSync(origin.source)
    ? await sourceChangedSince(store, origin.source, origin.state).catch(() => undefined)
    : undefined;
  return { path: origin.source, changed };
};
