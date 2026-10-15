import { git } from "../git/git.ts";

export type SourceRemote = {
  url: string;
  /** Commits of the archive's branch that no branch of its origin has, as of its last fetch. */
  unpushed: number;
};

export const readSourceRemote = async (source: string): Promise<SourceRemote | undefined> => {
  const url = await git(source, ["remote", "get-url", "origin"]);
  if (!url.ok || url.out === "") return undefined;
  const ahead = await git(source, ["rev-list", "--count", "HEAD", "--not", "--remotes=origin"]);
  return { url: url.out, unpushed: ahead.ok ? Number(ahead.out) : 0 };
};
