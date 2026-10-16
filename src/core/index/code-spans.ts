import { existsSync } from "node:fs";
import { posix, resolve } from "node:path";
import { gitSync } from "../git/git.ts";
import { lineRange } from "../text/line-range.ts";
import type { StoreIndex } from "./index.ts";
import type { CodeRef, CodeRoot } from "./links.ts";

/** `name.ts` or `dir/name.ts`, optionally followed by `:12` or `:12-40`. */
const FILE_SPAN = /^((?:[\w@+.-]+\/)*[\w@+-][\w@+.-]*\.[A-Za-z]\w*)(?::(\d+)(?:-(\d+))?)?$/;
const CODE_SPAN = /(`+)([^`]+)\1/g;

type Tracked = { root: CodeRoot; byName: ReadonlyMap<string, readonly string[]> };

const byName = (files: readonly string[]): ReadonlyMap<string, readonly string[]> => {
  const names = new Map<string, string[]>();
  for (const file of files) {
    const name = posix.basename(file);
    const same = names.get(name) ?? [];
    same.push(file);
    names.set(name, same);
  }
  return names;
};

const listings = new WeakMap<StoreIndex, readonly Tracked[]>();

/** Files git tracks in each code root on this machine, listed once per index. */
const trackedFiles = (index: StoreIndex): readonly Tracked[] => {
  const known = listings.get(index);
  if (known) return known;
  const listed = Object.values(index.config.roots).flatMap(({ path, ref }): Tracked[] => {
    const dir = resolve(index.root, path);
    const files = existsSync(dir) ? gitSync(dir, ["ls-files", "-z"]) : undefined;
    if (!files?.ok) return [];
    return [{ root: { dir, ref }, byName: byName(files.out.split("\0").filter(Boolean)) }];
  });
  listings.set(index, listed);
  return listed;
};

/** The one tracked file across all roots whose path ends with what was written. */
const findFile = (index: StoreIndex, written: string): Omit<CodeRef, "lines"> | undefined => {
  const matches = trackedFiles(index).flatMap(({ root, byName }) =>
    (byName.get(posix.basename(written)) ?? [])
      .filter((path) => path === written || path.endsWith(`/${written}`))
      .map((path) => ({ root, path })),
  );
  return matches.length === 1 ? matches[0] : undefined;
};

/** Code files named in inline code such as `` `send.ts:41` ``; ambiguous or unknown names are skipped. */
export const codeSpanRefs = (index: StoreIndex, texts: readonly string[]): CodeRef[] =>
  texts.flatMap((text) =>
    [...text.matchAll(CODE_SPAN)].flatMap((span): CodeRef[] => {
      const [, written, from, to] = FILE_SPAN.exec(span[2]?.trim() ?? "") ?? [];
      const file = written ? findFile(index, written) : undefined;
      return file ? [{ ...file, lines: lineRange(from, to) }] : [];
    }),
  );
