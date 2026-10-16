import { relative, resolve } from "node:path";
import { TroveError } from "../errors.ts";
import { realPath } from "../text/real-path.ts";

export type GitResult = { ok: boolean; out: string; err: string };

export type GitOptions = {
  /** Keeps leading spaces, which porcelain formats use as data. */
  raw?: boolean;
  env?: Readonly<Record<string, string>>;
};

const HOOK_VARIABLES = new Set(["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX"]);

/** The environment without the variables a git hook sets, which would steer every repository to the hook's. */
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
  // stdin stays closed: an MCP server over stdio reads its protocol from there.
  const child = Bun.spawn(["git", ...args], {
    cwd,
    env: { ...gitEnv(), ...env },
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

/** Root of the repository containing `cwd`, spelled like `cwd` even when git resolves symlinks. */
export const toplevel = async (cwd: string): Promise<string | undefined> => {
  const result = await git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!result.ok) return undefined;
  return resolve(cwd, relative(realPath(cwd), realPath(result.out)));
};
