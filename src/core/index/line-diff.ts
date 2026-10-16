import { z } from "zod";
import { gitSync } from "../git/git.ts";
import { type Hunk, parseHunks, WHOLE_FILE } from "../git/hunks.ts";
import { isIsoDate } from "../text/dates.ts";
import { type GitReads, readAtCommit } from "./git-reads.ts";
import { chunks } from "./history.ts";
import type { CodeRoot } from "./links.ts";

export type Hunks = ReadonlyMap<string, readonly Hunk[]>;

export type LineCheck = { root: CodeRoot; since: string; paths: ReadonlySet<string> };

/** A `null` count is the whole file, which JSON cannot hold as infinity. */
const HUNKS = z.array(z.tuple([z.string(), z.array(z.tuple([z.number(), z.number().nullable()]))]));

type SavedHunks = z.infer<typeof HUNKS>;

type SavedHunk = SavedHunks[number][1][number];

const toSaved = ({ start, count }: Hunk): SavedHunk => [
  start,
  Number.isFinite(count) ? count : null,
];

const toHunk = ([start, count]: SavedHunk): Hunk => ({ start, count: count ?? WHOLE_FILE.count });

/** The commit the check saw: itself, or the last one on or before the checked day. */
const baseOf = (root: CodeRoot, commit: string, since: string): string | undefined => {
  if (!isIsoDate(since)) return since;
  const base = gitSync(root.dir, ["rev-list", "-1", `--before=${since}T23:59:59`, commit]);
  return base.ok ? base.out : undefined;
};

const readHunks = (
  root: CodeRoot,
  commit: string,
  since: string,
  paths: readonly string[],
  ignoreSpace: boolean,
): SavedHunks | undefined => {
  const base = baseOf(root, commit, since);
  if (base === undefined) return undefined;
  if (!base) return paths.map((path) => [path, [toSaved(WHOLE_FILE)]]);
  const hunks: SavedHunks = [];
  for (const batch of chunks(paths)) {
    const diff = gitSync(root.dir, [
      "-c",
      "core.quotePath=false",
      "--literal-pathspecs",
      "diff",
      "-U0",
      ...(ignoreSpace ? ["--ignore-all-space", "--ignore-blank-lines"] : []),
      "--no-renames",
      "--no-ext-diff",
      "--no-color",
      "--relative",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      base,
      commit,
      "--",
      ...batch,
    ]);
    if (!diff.ok) return undefined;
    for (const [path, fileHunks] of parseHunks(diff.out)) {
      hunks.push([path, fileHunks.map(toSaved)]);
    }
  }
  return hunks;
};

/**
 * Old-side hunks since the check, so they are in the line numbers the references were written
 * against. `ignoreSpace` leaves out changes of whitespace and blank lines only.
 */
export const hunksSince = (
  reads: GitReads,
  { root, since, paths }: LineCheck,
  { ignoreSpace = false }: { ignoreSpace?: boolean } = {},
): Hunks | undefined => {
  const sorted = [...paths].sort();
  const mode = ignoreSpace ? "diff-ignore-space" : "diff";
  const saved = readAtCommit(reads, root, [mode, since, ...sorted], HUNKS, (commit) =>
    readHunks(root, commit, since, sorted, ignoreSpace),
  );
  return saved && new Map(saved.map(([path, hunks]) => [path, hunks.map(toHunk)]));
};
