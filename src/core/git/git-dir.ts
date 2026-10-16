import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const GITDIR_LINE = /^gitdir:\s*(.+)$/m;

const gitDirAt = (folder: string): string | undefined => {
  const dotGit = join(folder, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    const pointed = GITDIR_LINE.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
    return pointed ? resolve(folder, pointed) : undefined;
  } catch {
    return undefined;
  }
};

/** The git folder of the repository holding `from`, found without running git; a worktree's own one. */
export const findGitDir = (from: string): string | undefined => {
  const found = gitDirAt(from);
  const parent = dirname(from);
  return found ?? (parent === from ? undefined : findGitDir(parent));
};
