import { isAbsolute, posix, relative, resolve } from "node:path";
import { TroveError } from "../errors.ts";
import { toPosix } from "../store/paths.ts";
import { type LineRange, parseRange, rangesOverlap } from "../text/line-range.ts";
import type { StoreIndex } from "./index.ts";
import { type CodeRef, codeRoot } from "./links.ts";

const GLOB = /[*?[{]/;

/** A path in one code root, or in any of them when it was written relative to the project. */
type Place = { dir: string | undefined; matches: (path: string) => boolean };

export type CodeTarget = { places: readonly Place[]; lines: LineRange | undefined };

const clean = (path: string): string => {
  const normal = posix.normalize(toPosix(path)).replace(/\/+$/, "");
  return normal === "." ? "" : normal;
};

/** A file, the folder around a file, or a file inside a folder the reference names. */
const pathMatcher = (pattern: string): ((path: string) => boolean) => {
  if (GLOB.test(pattern)) {
    const glob = new Bun.Glob(pattern);
    return (path) => glob.match(path);
  }
  return (path) =>
    pattern === "" ||
    path === pattern ||
    path.startsWith(`${pattern}/`) ||
    pattern.startsWith(`${path}/`);
};

/** Absolute, relative to `cwd`, or relative to a code root; a glob such as `web/src/**` too. */
export const codeTarget = (
  index: StoreIndex,
  cwd: string,
  written: string,
  lines?: LineRange,
): CodeTarget => {
  if (Object.keys(index.config.roots).length === 0) {
    throw new TroveError("the store names no code roots: add them under `roots` in its config");
  }
  const absolute = resolve(cwd, written);
  const root = codeRoot(index, absolute);
  const places: Place[] = [
    ...(root ? [{ dir: root.dir, matches: pathMatcher(clean(relative(root.dir, absolute))) }] : []),
    ...(isAbsolute(written) ? [] : [{ dir: undefined, matches: pathMatcher(clean(written)) }]),
  ];
  if (places.length === 0) throw new TroveError(`${written} is in no code root of the store`);
  return { places, lines };
};

export const linesOption = (text: string | undefined): LineRange | undefined => {
  if (text === undefined) return undefined;
  const lines = parseRange(text);
  if (!lines) throw new TroveError(`lines take A-B or a single line: ${text}`);
  return lines;
};

export const targetMatches = ({ places, lines }: CodeTarget, ref: CodeRef): boolean =>
  (lines === undefined || ref.lines === undefined || rangesOverlap(lines, ref.lines)) &&
  places.some(
    ({ dir, matches }) => (dir === undefined || dir === ref.root.dir) && matches(ref.path),
  );
