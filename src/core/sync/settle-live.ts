import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../git/git.ts";
import { withoutLiveBlocks } from "../live/blocks.ts";

const STAGES = ["1", "2", "3"] as const;

const stage = async (root: string, n: string, file: string): Promise<string | undefined> => {
  const shown = await git(root, ["show", `:${n}:${file}`], { raw: true });
  return shown.ok ? shown.out : undefined;
};

/**
 * Settles a conflict that lies only inside generated `trove:` blocks: merges the three sides with
 * the blocks emptied and stages that. The blocks are refilled by the rebuild after the rebase.
 */
export const settleLiveConflict = async (root: string, file: string): Promise<boolean> => {
  const sides = await Promise.all(STAGES.map((n) => stage(root, n, file)));
  if (sides.some((side) => side === undefined)) return false;
  const dir = await mkdtemp(join(tmpdir(), "trove-merge-"));
  try {
    const paths = STAGES.map((n) => join(dir, n));
    await Promise.all(paths.map((path, i) => Bun.write(path, withoutLiveBlocks(sides[i] ?? ""))));
    const [base, ours, theirs] = paths as [string, string, string];
    const merged = await git(root, ["merge-file", "-p", ours, base, theirs], { raw: true });
    if (!merged.ok) return false;
    await Bun.write(join(root, file), merged.out);
    return (await git(root, ["add", "--", file])).ok;
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  }
};
