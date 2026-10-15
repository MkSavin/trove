import { join } from "node:path";
import { CONFIG_FILE } from "../config/load.ts";
import { TroveError } from "../errors.ts";
import { git, gitOrThrow } from "../git/git.ts";
import type { Store } from "../store/open.ts";
import { commitPaths, isRepositoryRoot } from "./git-steps.ts";

const SYNC_LINE = /^sync:.*$/m;

/** Rewrites only the `sync:` line, so the rest of the config keeps its comments and layout. */
const withSyncMode = (configText: string, mode: string): string =>
  SYNC_LINE.test(configText)
    ? configText.replace(SYNC_LINE, `sync: ${mode}`)
    : `${configText.trimEnd()}\nsync: ${mode}\n`;

export type RemoteResult = { pushed: boolean; warning: string | undefined };

/** Makes `url` the store's origin, switches sync to push and pushes the history. */
export const addRemote = async (store: Store, url: string): Promise<RemoteResult> => {
  if (!(await isRepositoryRoot(store.root))) {
    throw new TroveError("the store is not the root of a git repository");
  }
  if ((await git(store.root, ["remote", "get-url", "origin"])).ok) {
    throw new TroveError("the store already has an origin");
  }
  await gitOrThrow(store.root, ["remote", "add", "origin", url]);

  const config = Bun.file(join(store.root, CONFIG_FILE));
  await Bun.write(config, withSyncMode(await config.text(), "push"));
  await commitPaths(store.root, [CONFIG_FILE], "trove: sync with origin");

  const branch = await gitOrThrow(store.root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const pushed = await git(store.root, ["push", "--quiet", "--set-upstream", "origin", branch]);
  return pushed.ok
    ? { pushed: true, warning: undefined }
    : { pushed: false, warning: `origin set, push failed: ${pushed.err}` };
};
