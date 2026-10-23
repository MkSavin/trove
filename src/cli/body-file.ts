import { resolve } from "node:path";
import { TroveError } from "../core/errors.ts";
import type { Io } from "./io.ts";

const STDIN = "-";

export const readBodyFile = async (
  path: string | undefined,
  io: Io,
): Promise<string | undefined> => {
  if (path === undefined) return undefined;
  if (path === STDIN) return Bun.stdin.text();
  const file = Bun.file(resolve(io.cwd, path));
  if (!(await file.exists())) throw new TroveError(`no body file ${path}`);
  return file.text();
};
