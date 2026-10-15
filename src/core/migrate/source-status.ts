import { git } from "../git/git.ts";

export type Pending = { path: string; deleted: boolean };

/** `git status -z` entries; a rename carries its old path as the next entry. */
const parseStatus = (output: string): Pending[] => {
  const entries = output.split("\0").filter(Boolean);
  const pending: Pending[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    const [x, y] = [entry[0], entry[1]];
    const path = entry.slice(3);
    pending.push({ path, deleted: x === "D" || y === "D" });
    if (x === "R" || x === "C") {
      const from = entries[++i];
      if (from && x === "R") pending.push({ path: from, deleted: true });
    }
  }
  return pending;
};

/** Read-only on the source: `--no-optional-locks` keeps git from refreshing its index there. */
export const sourceChanges = async (source: string): Promise<Pending[]> => {
  const status = await git(
    source,
    ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { raw: true },
  );
  return status.ok ? parseStatus(status.out) : [];
};
