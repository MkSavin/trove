import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { findGitDir } from "./git-dir.ts";

const VERSION = 1;
const FILE = "trove/commit-cache.json";

const saved = z.object({ version: z.literal(VERSION), entries: z.record(z.string(), z.unknown()) });

type Entries = Record<string, unknown>;

/** Results of the latest run in this process: a long-running server reuses them without the disk. */
let memory: Entries = {};

/**
 * Git reads keyed by the commit they ran against, so a new commit is a new key and old results
 * are never served for it. Kept in memory and in the store's git folder.
 */
export type CommitMemo = {
  read: <T>(key: string, schema: z.ZodType<T>, compute: () => T | undefined) => T | undefined;
  save: () => void;
};

const load = (file: string | undefined): Entries => {
  if (!file) return {};
  try {
    const parsed = saved.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data.entries : {};
  } catch {
    return {};
  }
};

/** A temporary file renamed into place, so a reader never sees half of it. */
const write = (file: string, entries: Entries): void => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: VERSION, entries }));
    renameSync(temporary, file);
  } catch {
    // Only a cache: the next run reads git again.
  }
};

export const commitCachePath = (storeRoot: string): string | undefined => {
  const gitDir = findGitDir(storeRoot);
  return gitDir ? `${gitDir}/${FILE}` : undefined;
};

export const openCommitMemo = (file: string | undefined): CommitMemo => {
  let disk: Entries | undefined;
  const used: Entries = {};
  let computed = false;
  const known = (key: string): unknown => {
    if (Object.hasOwn(memory, key)) return memory[key];
    disk ??= load(file);
    return Object.hasOwn(disk, key) ? disk[key] : undefined;
  };
  return {
    read: (key, schema, compute) => {
      const parsed = schema.safeParse(known(key));
      const value = parsed.success ? parsed.data : compute();
      if (value === undefined) return undefined;
      used[key] = value;
      computed ||= !parsed.success;
      return value;
    },
    save: () => {
      memory = used;
      if (computed && file) write(file, used);
      computed = false;
    },
  };
};
