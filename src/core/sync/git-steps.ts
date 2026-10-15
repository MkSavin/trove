import { git, gitOrThrow, toplevel } from "../git/git.ts";
import { samePath } from "../text/real-path.ts";
import { settleLiveConflict } from "./settle-live.ts";

export type Committed = { sha: string | undefined; error: string | undefined };

/** A store nested inside another repository must never commit into it. */
export const isRepositoryRoot = async (root: string): Promise<boolean> => {
  const top = await toplevel(root);
  return top !== undefined && samePath(top, root);
};

/** Stages the paths (deletions included) and commits them; nothing staged means no commit. */
export const commitPaths = async (
  root: string,
  paths: readonly string[] | "all",
  message: string,
): Promise<Committed> => {
  await gitOrThrow(root, paths === "all" ? ["add", "--all"] : ["add", "--all", "--", ...paths]);
  if ((await git(root, ["diff", "--cached", "--quiet"])).ok)
    return { sha: undefined, error: undefined };
  const done = await git(root, ["commit", "--quiet", "-m", message]);
  if (!done.ok) return { sha: undefined, error: done.err || done.out || "git commit failed" };
  return { sha: await gitOrThrow(root, ["rev-parse", "--short", "HEAD"]), error: undefined };
};

const conflicted = async (root: string): Promise<string[]> =>
  (await git(root, ["diff", "--name-only", "--diff-filter=U"])).out.split("\n").filter(Boolean);

export type Pushed = { pushed: boolean; warning: string | undefined };

const MAX_STEPS = 100;
const NO_EDITOR = ["-c", "core.editor=true"];

/**
 * Walks a stopped rebase through conflicts that touch only generated files or generated blocks,
 * taking the upstream copy: they are rebuilt afterwards anyway. Returns what still conflicts.
 */
const settleGenerated = async (root: string, generated: readonly string[]): Promise<string[]> => {
  for (let step = 0; step < MAX_STEPS; step++) {
    const files = await conflicted(root);
    if (files.length === 0) return [];
    const handWritten = files.filter((file) => !generated.includes(file));
    const settled = await Promise.all(handWritten.map((file) => settleLiveConflict(root, file)));
    const manual = handWritten.filter((_, i) => !settled[i]);
    if (manual.length > 0) return manual;
    const reports = files.filter((file) => generated.includes(file));
    if (reports.length > 0) {
      await gitOrThrow(root, ["checkout", "--ours", "--", ...reports]);
      await gitOrThrow(root, ["add", "--", ...reports]);
    }
    const next = await git(root, [...NO_EDITOR, "rebase", "--continue"]);
    if (next.ok && (await conflicted(root)).length === 0) return [];
  }
  return ["(rebase did not settle)"];
};

/**
 * Pushes; when the remote moved on, rebases, settles conflicts in generated files and lets
 * `rebuild` regenerate them before trying again. Hand-written conflicts abort. Never forces.
 */
export const pushWithRebase = async (
  root: string,
  generated: readonly string[],
  rebuild: () => Promise<readonly string[]>,
): Promise<Pushed> => {
  const [remote] = (await git(root, ["remote"])).out.split("\n").filter(Boolean);
  if (!remote) return { pushed: false, warning: "no remote: committed locally only" };
  const branch = await gitOrThrow(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const push = ["push", "--quiet", "--set-upstream", remote, branch];
  if ((await git(root, push)).ok) return { pushed: true, warning: undefined };

  const pulled = await git(root, [...NO_EDITOR, "pull", "--rebase", "--quiet", remote, branch]);
  const manual = pulled.ok ? [] : await settleGenerated(root, generated);
  if (manual.length > 0) {
    await git(root, ["rebase", "--abort"]);
    return {
      pushed: false,
      warning: `conflict in ${manual.join(", ")}: not pushed; resolve it, then run trove sync`,
    };
  }

  const rebuilt = await rebuild();
  if (rebuilt.length > 0) await commitPaths(root, rebuilt, "docs: rebuild reports");
  const again = await git(root, push);
  return again.ok
    ? { pushed: true, warning: undefined }
    : { pushed: false, warning: `push failed: ${again.err}` };
};
