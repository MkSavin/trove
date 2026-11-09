import { git } from "../git/git.ts";
import { isRepositoryRoot } from "./git-steps.ts";

// -z keeps non-ASCII names readable; no optional locks, so polling never gets in a commit's way.
const STATUS = [
  "--no-optional-locks",
  "status",
  "--porcelain",
  "-z",
  "--no-renames",
  "--untracked-files=all",
];
const STATUS_PREFIX = 3;

/** Store-relative paths git would report; empty when the folder is not a repository root. */
export const uncommittedPaths = async (root: string): Promise<readonly string[]> => {
  if (!(await isRepositoryRoot(root))) return [];
  const status = await git(root, STATUS, { raw: true });
  if (!status.ok) return [];
  return status.out
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(STATUS_PREFIX));
};
