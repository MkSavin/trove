import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

/** The path with symlinks resolved, e.g. macOS `/var` → `/private/var`; as given when missing. */
export const realPath = (path: string): string => {
  try {
    return realpathSync.native(resolve(path));
  } catch {
    return resolve(path);
  }
};

export const samePath = (a: string, b: string): boolean => {
  const [x, y] = [realPath(a), realPath(b)];
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};

export const isInside = (root: string, path: string): boolean => {
  const rel = relative(realPath(root), realPath(path));
  return !rel.startsWith("..") && !isAbsolute(rel);
};
