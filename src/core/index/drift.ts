import { existsSync } from "node:fs";
import { z } from "zod";
import type { Item } from "../document/ledger.ts";
import { type CommitMemo, commitCachePath, openCommitMemo } from "../git/commit-memo.ts";
import { gitSync } from "../git/git.ts";
import { type Hunk, parseHunks, touches, WHOLE_FILE } from "../git/hunks.ts";
import { isIsoDate } from "../text/dates.ts";
import type { LineRange } from "../text/line-range.ts";
import { itemCodeRefs, refText } from "./code-refs.ts";
import type { StoreIndex } from "./index.ts";
import { type CodeRef, type CodeRoot, rootKey } from "./links.ts";

/** `true` names what changed; `unknown` when nothing the item points at could be checked. */
export type Drift = { state: "true"; changed: readonly string[] } | { state: "false" | "unknown" };

type RefState = "changed" | "unchanged" | "unknown";

type Watched = { item: Item; since: string; refs: readonly CodeRef[] };

type Assessed = { item: Item; since: string; refs: readonly { ref: CodeRef; state: RefState }[] };

/** Changed file → the date of its latest change. */
type Changes = ReadonlyMap<string, string>;

type Hunks = ReadonlyMap<string, readonly Hunk[]>;

type LineCheck = { root: CodeRoot; since: string; paths: Set<string> };

type Run = { commits: ReadonlyMap<string, string | undefined>; memo: CommitMemo };

const CHANGES = z.array(z.tuple([z.string(), z.string()]));
/** A `null` count is the whole file. */
const HUNKS = z.array(z.tuple([z.string(), z.array(z.tuple([z.number(), z.number().nullable()]))]));

type SavedHunks = z.infer<typeof HUNKS>;

type SavedHunk = SavedHunks[number][1][number];

const finite = (count: number): number | null => (Number.isFinite(count) ? count : null);

const toSaved = ({ start, count }: Hunk): SavedHunk => [start, finite(count)];

const toHunk = ([start, count]: SavedHunk): Hunk => ({
  start,
  count: count ?? WHOLE_FILE.count,
});

const HEAD = "HEAD";
const UNKNOWN: Drift = { state: "unknown" };
const UNCHANGED: Drift = { state: "false" };
/** Keeps each git command line well under the Windows limit. */
const PATHS_PER_CALL = 100;

const watched = (index: StoreIndex): Watched[] =>
  index.items.flatMap((item) => {
    const doc = index.byRel.get(item.document);
    const since = doc?.meta.checked;
    if (!doc || since === undefined || !isIsoDate(since)) return [];
    const refs = itemCodeRefs(index, doc, item);
    return refs.length > 0 ? [{ item, since, refs }] : [];
  });

const chunks = <T>(values: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, i) =>
    values.slice(i * size, (i + 1) * size),
  );

/** Each commit prints as `\0<date>` followed by the files it changed, relative to the root. */
const readLog = (out: string, into: Map<string, string>): void => {
  for (const commit of out.split("\0")) {
    const [date = "", ...files] = commit.split("\n").filter(Boolean);
    for (const file of files) {
      if ((into.get(file) ?? "") < date) into.set(file, date);
    }
  }
};

const readChanges = (dir: string, commit: string, paths: readonly string[], since: string) => {
  const changes = new Map<string, string>();
  for (const batch of chunks(paths, PATHS_PER_CALL)) {
    const log = gitSync(dir, [
      "-c",
      "core.quotePath=false",
      "--literal-pathspecs",
      "log",
      `--since=${since}T00:00:00`,
      "--format=%x00%cs",
      "--name-only",
      "--relative",
      commit,
      "--",
      ...batch,
    ]);
    if (!log.ok) return undefined;
    readLog(log.out, changes);
  }
  return [...changes];
};

/** Missing when git cannot read the root, e.g. its ref is unknown here. */
const changesAt = (
  run: Run,
  root: CodeRoot,
  paths: readonly string[],
  since: string,
): Changes | undefined => {
  const commit = run.commits.get(rootKey(root));
  if (!commit) return undefined;
  const key = ["log", root.dir, commit, since, ...paths].join("\0");
  const read = run.memo.read(key, CHANGES, () => readChanges(root.dir, commit, paths, since));
  return read && new Map(read);
};

/** One git log per code root on this machine, from the earliest `checked` date pointing into it. */
const changesByRoot = (
  run: Run,
  items: readonly Watched[],
): ReadonlyMap<string, Changes | undefined> => {
  const roots = new Map<string, { root: CodeRoot; paths: Set<string>; since: string }>();
  for (const { since, refs } of items) {
    for (const { root, path } of refs) {
      const key = rootKey(root);
      const entry = roots.get(key) ?? { root, paths: new Set<string>(), since };
      entry.paths.add(path);
      if (since < entry.since) entry.since = since;
      roots.set(key, entry);
    }
  }
  return new Map(
    [...roots].map(([key, { root, paths, since }]) => [
      key,
      changesAt(run, root, [...paths].sort(), since),
    ]),
  );
};

/** A linked folder changed when anything inside it changed. */
const fileState = (changes: Changes | undefined, path: string, since: string): RefState => {
  if (!changes) return "unknown";
  const changed = [...changes].some(
    ([file, date]) => date > since && (file === path || file.startsWith(`${path}/`)),
  );
  return changed ? "changed" : "unchanged";
};

const lineKey = (root: CodeRoot, since: string): string => `${rootKey(root)}\0${since}`;

/** Files that changed and whose references name lines: only those need a diff. */
const lineChecks = (items: readonly Assessed[]): Map<string, LineCheck> => {
  const checks = new Map<string, LineCheck>();
  for (const { since, refs } of items) {
    for (const { ref, state } of refs) {
      if (state !== "changed" || !ref.lines) continue;
      const key = lineKey(ref.root, since);
      const check = checks.get(key) ?? { root: ref.root, since, paths: new Set<string>() };
      check.paths.add(ref.path);
      checks.set(key, check);
    }
  }
  return checks;
};

/**
 * Line numbers were written against the code as of `checked`, so the diff runs from the last
 * commit on or before that day; its old-side hunks are in exactly those numbers.
 */
const readHunks = (
  dir: string,
  commit: string,
  since: string,
  paths: readonly string[],
): SavedHunks | undefined => {
  const base = gitSync(dir, ["rev-list", "-1", `--before=${since}T23:59:59`, commit]);
  if (!base.ok) return undefined;
  if (!base.out) return paths.map((path): SavedHunks[number] => [path, [toSaved(WHOLE_FILE)]]);
  const hunks: SavedHunks = [];
  for (const batch of chunks(paths, PATHS_PER_CALL)) {
    const diff = gitSync(dir, [
      "-c",
      "core.quotePath=false",
      "--literal-pathspecs",
      "diff",
      "-U0",
      "--no-renames",
      "--no-ext-diff",
      "--no-color",
      "--relative",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      base.out,
      commit,
      "--",
      ...batch,
    ]);
    if (!diff.ok) return undefined;
    for (const [path, fileHunks] of parseHunks(diff.out))
      hunks.push([path, fileHunks.map(toSaved)]);
  }
  return hunks;
};

const hunksSince = (run: Run, { root, since, paths }: LineCheck): Hunks | undefined => {
  const commit = run.commits.get(rootKey(root));
  if (!commit) return undefined;
  const sorted = [...paths].sort();
  const key = ["diff", root.dir, commit, since, ...sorted].join("\0");
  const read = run.memo.read(key, HUNKS, () => readHunks(root.dir, commit, since, sorted));
  return read && new Map(read.map(([path, hunks]) => [path, hunks.map(toHunk)]));
};

const lineState = (hunks: Hunks | undefined, path: string, lines: LineRange): RefState => {
  if (!hunks) return "unknown";
  return (hunks.get(path) ?? []).some((hunk) => touches(hunk, lines)) ? "changed" : "unchanged";
};

/** Changed when anything changed; unchanged only when everything could be checked. */
const verdict = (refs: readonly { ref: CodeRef; state: RefState }[]): Drift => {
  const changed = refs.filter(({ state }) => state === "changed").map(({ ref }) => refText(ref));
  if (changed.length > 0) return { state: "true", changed: [...new Set(changed)] };
  return refs.some(({ state }) => state === "unknown") ? UNKNOWN : UNCHANGED;
};

/** The commit each root's ref points at now; results are cached under it. */
const commitsOf = (items: readonly Watched[]): ReadonlyMap<string, string | undefined> => {
  const roots = new Map(items.flatMap(({ refs }) => refs.map(({ root }) => [rootKey(root), root])));
  return new Map(
    [...roots].map(([key, root]) => {
      if (!existsSync(root.dir)) return [key, undefined];
      const ref = `${root.ref ?? HEAD}^{commit}`;
      const parsed = gitSync(root.dir, ["rev-parse", "--verify", "--quiet", ref]);
      return [key, parsed.ok ? parsed.out : undefined];
    }),
  );
};

const findDrifts = (index: StoreIndex): ReadonlyMap<Item, Drift> => {
  const items = watched(index);
  const run: Run = {
    commits: commitsOf(items),
    memo: openCommitMemo(commitCachePath(index.root)),
  };
  const changes = changesByRoot(run, items);
  const assessed: Assessed[] = items.map(({ item, since, refs }) => ({
    item,
    since,
    refs: refs.map((ref) => ({
      ref,
      state: fileState(changes.get(rootKey(ref.root)), ref.path, since),
    })),
  }));
  const hunks = new Map(
    [...lineChecks(assessed)].map(([key, check]) => [key, hunksSince(run, check)]),
  );
  run.memo.save();
  return new Map(
    assessed.map(({ item, since, refs }) => [
      item,
      verdict(
        refs.map(({ ref, state }) =>
          state === "changed" && ref.lines
            ? { ref, state: lineState(hunks.get(lineKey(ref.root, since)), ref.path, ref.lines) }
            : { ref, state },
        ),
      ),
    ]),
  );
};

const drifts = new WeakMap<StoreIndex, ReadonlyMap<Item, Drift>>();

/**
 * Whether code the item points at changed after its document's `checked` date.
 * Computed for the whole index on first use, so a store that never asks never runs git for it.
 */
export const itemDrift = (index: StoreIndex, item: Item): Drift => {
  const known = drifts.get(index) ?? findDrifts(index);
  drifts.set(index, known);
  return known.get(item) ?? UNKNOWN;
};
