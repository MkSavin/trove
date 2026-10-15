import { git } from "./git.ts";
import { type WebRepo, webRepo } from "./permalink.ts";

/** Where a deleted file can still be read: the parent of the commit that deleted it. */
export type Deletion = {
  short: string;
  parent: string;
  /** The file's path from the repository top, for a web link. */
  path: string;
  /** Set when the parent is on a remote branch of a web-hosted `origin`. */
  web: WebRepo | undefined;
};

const output = async (dir: string, args: readonly string[]): Promise<string | undefined> => {
  const result = await git(dir, args);
  return result.ok ? result.out : undefined;
};

const onRemote = async (dir: string, commit: string): Promise<boolean> =>
  Boolean(
    await output(dir, [
      "for-each-ref",
      "--count=1",
      "--format=%(refname)",
      `--contains=${commit}`,
      "refs/remotes",
    ]),
  );

const webOf = async (dir: string, parent: string): Promise<WebRepo | undefined> => {
  const remote = await output(dir, ["remote", "get-url", "origin"]);
  const web = remote ? webRepo(remote) : undefined;
  return web && (await onRemote(dir, parent)) ? web : undefined;
};

/** The last commit up to `ref` that deleted `path` (relative to `dir`, renames count), or why there is none. */
export const findDeletion = async (
  dir: string,
  ref: string,
  path: string,
): Promise<Deletion | string> => {
  const prefix = await output(dir, ["rev-parse", "--show-prefix"]);
  if (prefix === undefined) return "not a git repository";
  if ((await git(dir, ["cat-file", "-e", `${ref}:./${path}`])).ok)
    return `still in ${ref}, deleted only in the checkout`;
  const log = ["log", ref, "--no-renames", "--diff-filter=D", "-1", "--format=%H", "--", path];
  const commit = await output(dir, log);
  if (!commit) return "never in git history";
  const parent = await output(dir, ["rev-parse", `${commit}^`]);
  const short = await output(dir, ["rev-parse", "--short", commit]);
  if (!parent || !short) return `cannot read the parent of ${commit}`;
  return { short, parent, path: `${prefix}${path}`, web: await webOf(dir, parent) };
};
