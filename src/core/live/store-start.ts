import { CONFIG_FILE } from "../config/load.ts";
import { git } from "../git/git.ts";

/** The commit a starting point moved to because the store did not exist yet at `on`. */
export type MovedBase = { commit: string; date: string; on: string };

/** Whether the store's config was committed by then: before that the folder holds no store. */
export const storeAt = async (root: string, commit: string): Promise<boolean> =>
  (await git(root, ["cat-file", "-e", `${commit}:./${CONFIG_FILE}`])).ok;

/** The first commit of the main line after `after` that adds the store's config, with its date. */
const firstStoreCommit = async (
  root: string,
  after: string | undefined,
): Promise<{ commit: string; date: string } | undefined> => {
  const found = await git(root, [
    "log",
    "--first-parent",
    "--reverse",
    "--diff-filter=A",
    "--format=%H %cs",
    after ? `${after}..HEAD` : "HEAD",
    "--",
    CONFIG_FILE,
  ]);
  const [commit, date] = (found.ok ? (found.out.split("\n")[0] ?? "") : "").split(" ");
  return commit && date ? { commit, date } : undefined;
};

/**
 * The starting commit, or the first one holding the store when the start predates it; no commit
 * when the store was never committed.
 */
export const startWithStore = async (
  root: string,
  start: { commit: string | undefined; on: string },
): Promise<{ commit: string | undefined; moved: MovedBase | undefined }> => {
  if (start.commit && (await storeAt(root, start.commit)))
    return { commit: start.commit, moved: undefined };
  const first = await firstStoreCommit(root, start.commit);
  return { commit: first?.commit, moved: first && { ...first, on: start.on } };
};
