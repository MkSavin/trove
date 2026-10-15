import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gitOrThrow } from "../git/git.ts";
import { type Pending, sourceChanges } from "./source-status.ts";

export type Copied = {
  /** The source was a git repository and the target keeps its history. */
  history: boolean;
  /** Paths whose uncommitted state in the source was carried over. */
  uncommitted: readonly string[];
};

const overlay = async (source: string, target: string, pending: readonly Pending[]) => {
  for (const { path, deleted } of pending) {
    const to = join(target, path);
    if (deleted) {
      await rm(to, { force: true });
    } else {
      await mkdir(dirname(to), { recursive: true });
      await cp(join(source, path), to);
    }
  }
};

/**
 * Clones a git source with its history and lays its uncommitted work on top; anything else is
 * copied as files. The source is only read.
 */
export const copySource = async (source: string, target: string): Promise<Copied> => {
  if (!existsSync(join(source, ".git"))) {
    await cp(source, target, { recursive: true });
    return { history: false, uncommitted: [] };
  }
  await gitOrThrow(dirname(target), ["clone", "--quiet", "--no-hardlinks", source, target]);
  await gitOrThrow(target, ["remote", "remove", "origin"]);
  const pending = await sourceChanges(source);
  await overlay(source, target, pending);
  return { history: true, uncommitted: pending.map((entry) => entry.path) };
};
