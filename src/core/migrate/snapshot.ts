import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitOrThrow } from "../git/git.ts";
import { sourceChanges, sourceFiles } from "./source-status.ts";

/** The source's last commit, fetched into the store's repository. */
const fetchHead = async (source: string, store: string): Promise<string> => {
  await gitOrThrow(store, ["fetch", "--quiet", "--no-tags", source, "HEAD"]);
  return gitOrThrow(store, ["rev-parse", "FETCH_HEAD"]);
};

/**
 * A commit in the store's repository holding the source as it is right now: its last commit plus
 * uncommitted work, or every file when it is not a repository. The source is only read.
 */
export const snapshotSource = async (source: string, store: string): Promise<string> => {
  const env = { GIT_INDEX_FILE: join(tmpdir(), `trove-snapshot-${process.pid}-${Date.now()}`) };
  try {
    const isRepository = existsSync(join(source, ".git"));
    const parent = isRepository ? await fetchHead(source, store) : undefined;
    await gitOrThrow(store, parent ? ["read-tree", parent] : ["read-tree", "--empty"], { env });

    const pending = isRepository ? await sourceChanges(source) : await sourceFiles(source);
    for (const { path, deleted } of pending) {
      if (deleted) {
        await gitOrThrow(store, ["update-index", "--force-remove", "--", path], { env });
        continue;
      }
      const blob = await gitOrThrow(store, [
        "hash-object",
        "-w",
        `--path=${path}`,
        join(source, path),
      ]);
      await gitOrThrow(store, ["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`], {
        env,
      });
    }

    const tree = await gitOrThrow(store, ["write-tree"], { env });
    const parents = parent ? ["-p", parent] : [];
    return await gitOrThrow(store, ["commit-tree", tree, ...parents, "-m", "trove: source state"]);
  } finally {
    await rm(env.GIT_INDEX_FILE, { force: true });
  }
};
