import { resolve } from "node:path";
import { TroveError } from "../errors.ts";

export type GitResult = { ok: boolean; out: string; err: string };

export type GitOptions = {
  /** Keeps leading spaces, which porcelain formats use as data. */
  raw?: boolean;
  env?: Readonly<Record<string, string>>;
};

export const git = async (
  cwd: string,
  args: readonly string[],
  { raw = false, env }: GitOptions = {},
): Promise<GitResult> => {
  const command = Bun.$`git ${args}`.cwd(cwd).quiet().nothrow();
  const result = await (env ? command.env({ ...process.env, ...env }) : command);
  const out = result.stdout.toString();
  return {
    ok: result.exitCode === 0,
    out: raw ? out : out.trim(),
    err: result.stderr.toString().trim(),
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

/** Root of the repository containing `cwd`, or nothing outside a repository. */
export const toplevel = async (cwd: string): Promise<string | undefined> => {
  const result = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return result.ok ? resolve(result.out) : undefined;
};
