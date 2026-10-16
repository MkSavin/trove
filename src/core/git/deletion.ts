import type { Pin } from "../markdown/links.ts";
import { git } from "./git.ts";
import { sshHost, type WebRepo, webRepo } from "./permalink.ts";

/** Where a file gone from the checkout can still be read, and how its link says so. */
export type Found = {
  pin: Pin;
  /** Full commit that has the file. */
  readAt: string;
  /** The file's path from the repository top, for a web link. */
  path: string;
  /** Set when that commit is on a remote branch of a web-hosted `origin`. */
  web: WebRepo | undefined;
  /** A branch that has the commit, when the file is not in the root's own history. */
  branch: string | undefined;
};

const HOSTNAME = /^hostname (\S+)$/m;

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

/** An SSH remote may name a `~/.ssh/config` alias; `ssh -G` tells the real host, without connecting. */
const realHost = async (host: string): Promise<string | undefined> => {
  const resolved = await Bun.$`ssh -G ${host}`.quiet().nothrow();
  return resolved.exitCode === 0 ? HOSTNAME.exec(resolved.stdout.toString())?.[1] : undefined;
};

const webOf = async (dir: string, commit: string): Promise<WebRepo | undefined> => {
  const remote = await output(dir, ["remote", "get-url", "origin"]);
  if (!remote) return undefined;
  const alias = sshHost(remote);
  const host = alias ? await realHost(alias) : undefined;
  if (alias && !host) return undefined;
  const web = webRepo(remote, host);
  return web && (await onRemote(dir, commit)) ? web : undefined;
};

const branchOf = async (dir: string, commit: string): Promise<string | undefined> =>
  (
    await output(dir, [
      "for-each-ref",
      "--count=1",
      "--format=%(refname:short)",
      `--contains=${commit}`,
      "refs/heads",
      "refs/remotes",
    ])
  )?.split("\n")[0];

const short = (dir: string, commit: string) => output(dir, ["rev-parse", "--short", commit]);

/** The parent of the commit that deleted the file, or the last commit of any branch that has it. */
const lastSeen = async (
  dir: string,
  ref: string,
  path: string,
): Promise<{ pin: Pin; readAt: string; elsewhere: boolean } | string> => {
  const deleting = ["log", ref, "--no-renames", "--diff-filter=D", "-1", "--format=%H", "--", path];
  const inRef = await output(dir, deleting);
  const touching = ["log", "--all", "--no-renames", "-1", "--format=%H", "--", path];
  const commit = inRef || (await output(dir, touching));
  if (!commit) return `never in ${ref} or any other branch`;
  const name = await short(dir, commit);
  if (!name) return `cannot read ${commit}`;
  const deleted = !(await git(dir, ["cat-file", "-e", `${commit}:./${path}`])).ok;
  const readAt = deleted ? await output(dir, ["rev-parse", `${commit}^`]) : commit;
  if (!readAt) return `cannot read the parent of ${commit}`;
  const pin: Pin = { note: deleted ? "deleted in" : "at", commit: name };
  return { pin, readAt, elsewhere: !inRef };
};

/** Where a file linked from the store can still be read, or why it cannot be pinned. */
export const findPin = async (dir: string, ref: string, path: string): Promise<Found | string> => {
  const prefix = await output(dir, ["rev-parse", "--show-prefix"]);
  if (prefix === undefined) return "not a git repository";
  if ((await git(dir, ["cat-file", "-e", `${ref}:./${path}`])).ok)
    return `still in ${ref}, deleted only in the checkout`;
  const seen = await lastSeen(dir, ref, path);
  if (typeof seen === "string") return seen;
  return {
    pin: seen.pin,
    readAt: seen.readAt,
    path: `${prefix}${path}`,
    web: await webOf(dir, seen.readAt),
    branch: seen.elsewhere ? await branchOf(dir, seen.readAt) : undefined,
  };
};
