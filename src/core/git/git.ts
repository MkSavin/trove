import { relative, resolve } from "node:path";
import { TroveError } from "../errors.ts";
import { realPath } from "../text/real-path.ts";

export type GitResult = { ok: boolean; out: string; err: string };

export type GitOptions = {
  /** Keeps leading spaces, which porcelain formats use as data. */
  raw?: boolean;
  env?: Readonly<Record<string, string>>;
};

// @anchor WORKAROUND:git-hook-variables A hook's variables would steer every repository to the hook's.
const HOOK_VARIABLES = new Set(["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX"]);

export const gitEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !HOOK_VARIABLES.has(entry[0]),
    ),
  );

export const git = async (
  cwd: string,
  args: readonly string[],
  { raw = false, env }: GitOptions = {},
): Promise<GitResult> => {
  const child = Bun.spawn(["git", ...args], {
    cwd,
    env: { ...gitEnv(), ...env },
    // @anchor WORKAROUND:child-stdin-closed An MCP server over stdio reads its protocol from stdin.
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { ok: code === 0, out: raw ? out : out.trim(), err: err.trim() };
};

/** For reads during a synchronous query; callers cache the result per index. */
export const gitSync = (cwd: string, args: readonly string[]): GitResult => {
  // @anchor WORKAROUND:child-stdin-closed An MCP server over stdio reads its protocol from stdin.
  const child = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(), stdin: "ignore" });
  return {
    ok: child.exitCode === 0,
    out: child.stdout.toString().trim(),
    err: child.stderr.toString().trim(),
  };
};

export const gitOrThrow = async (
  cwd: string,
  args: readonly string[],
  options: GitOptions = {},
): Promise<string> => {
  const result = await git(cwd, args, options);
  if (!result.ok) throw new TroveError(`git ${args.join(" ")} failed: ${result.err}`);
  return result.out;
};

export const toplevel = async (cwd: string): Promise<string | undefined> => {
  const result = await git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!result.ok) return undefined;
  // @anchor WORKAROUND:path-spelling git answers with symlinks resolved; callers compare against their spelling.
  return resolve(cwd, relative(realPath(cwd), realPath(result.out)));
};
