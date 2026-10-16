import { git } from "../git/git.ts";

/** How a local branch stands against its remote-tracking ref, when it has commits of its own. */
export type LocalLead = { ahead: number; behind: number };

export type BranchRef = {
  ref: string;
  name: string;
  time: number;
  date: string;
  local: LocalLead | undefined;
};

const REF_FORMAT = [
  "%(refname)",
  "%(refname:short)",
  "%(symref)",
  "%(committerdate:unix)",
  "%(committerdate:short)",
].join("%00");
const REMOTE = /^refs\/remotes\/[^/]+\//;
const LOCAL = /^refs\/heads\//;

const branchOf = (ref: string): string => ref.replace(LOCAL, "").replace(REMOTE, "");

const leadOf = async (dir: string, local: string, remote: string): Promise<LocalLead> => {
  const counted = await git(dir, ["rev-list", "--left-right", "--count", `${local}...${remote}`]);
  const [ahead = 0, behind = 0] = counted.out.split(/\s+/).map(Number);
  return { ahead, behind };
};

/**
 * One ref per branch: the remote-tracking one unless the local branch has commits it lacks. A
 * local branch only ahead is shown itself; one that diverged keeps the remote and is marked.
 */
const pickRef = async (dir: string, refs: readonly BranchRef[]): Promise<BranchRef | undefined> => {
  const local = refs.find((candidate) => LOCAL.test(candidate.ref));
  const remote = refs
    .filter((candidate) => candidate !== local)
    .toSorted((a, b) => b.time - a.time)[0];
  if (!local || !remote) return local ?? remote;
  const lead = await leadOf(dir, local.ref, remote.ref);
  if (lead.ahead === 0) return remote;
  return lead.behind === 0 ? { ...local, local: lead } : { ...remote, local: lead };
};

/** Local and remote-tracking branches matching the glob, each branch once. */
export const branchRefs = async (dir: string, pattern: string): Promise<BranchRef[]> => {
  const listed = await git(dir, [
    "for-each-ref",
    `--format=${REF_FORMAT}`,
    "refs/heads",
    "refs/remotes",
  ]);
  const glob = new Bun.Glob(pattern);
  const refs = listed.out
    .split("\n")
    .filter(Boolean)
    .flatMap((line): BranchRef[] => {
      const [ref = "", name = "", symref = "", time = "0", date = ""] = line.split("\0");
      return symref || !glob.match(branchOf(ref))
        ? []
        : [{ ref, name, time: Number(time), date, local: undefined }];
    });
  const branches = Map.groupBy(refs, (ref) => branchOf(ref.ref));
  const picked = await Promise.all([...branches.values()].map((group) => pickRef(dir, group)));
  return picked.filter((ref) => ref !== undefined);
};
