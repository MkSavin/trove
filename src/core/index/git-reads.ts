import { existsSync } from "node:fs";
import type { z } from "zod";
import { type CommitMemo, commitCachePath, openCommitMemo } from "../git/commit-memo.ts";
import { gitSync } from "../git/git.ts";
import type { StoreIndex } from "./index.ts";
import { type CodeRoot, rootKey } from "./links.ts";

export const HEAD = "HEAD";

/** Git reads for one index, cached by the commit each root's ref points at now. */
export type GitReads = { memo: CommitMemo; commitOf: (root: CodeRoot) => string | undefined };

const resolveCommit = (root: CodeRoot): string | undefined => {
  if (!existsSync(root.dir)) return undefined;
  const ref = `${root.ref ?? HEAD}^{commit}`;
  const parsed = gitSync(root.dir, ["rev-parse", "--verify", "--quiet", ref]);
  return parsed.ok && parsed.out ? parsed.out : undefined;
};

export const openGitReads = (index: StoreIndex): GitReads => {
  const commits = new Map<string, string | undefined>();
  return {
    memo: openCommitMemo(commitCachePath(index.root)),
    commitOf: (root) => {
      const key = rootKey(root);
      if (!commits.has(key)) commits.set(key, resolveCommit(root));
      return commits.get(key);
    },
  };
};

/** `key` must name every input besides the root and its commit; missing when git cannot read. */
export const readAtCommit = <T>(
  reads: GitReads,
  root: CodeRoot,
  key: readonly string[],
  schema: z.ZodType<T>,
  compute: (commit: string) => T | undefined,
): T | undefined => {
  const commit = reads.commitOf(root);
  if (!commit) return undefined;
  const full = [...key, root.dir, commit].join("\0");
  return reads.memo.read(full, schema, () => compute(commit));
};
