import type { Item } from "../document/ledger.ts";
import { touches } from "../git/hunks.ts";
import type { LineRange } from "../text/line-range.ts";
import { refText } from "./code-refs.ts";
import { codeHistory, commitsSince, type History } from "./history.ts";
import type { StoreIndex } from "./index.ts";
import { type Hunks, hunksSince, type LineCheck } from "./line-diff.ts";
import { type CodeRef, rootKey } from "./links.ts";

/** `true`: named code changed; `file`: only other lines of a file whose lines are named. */
export type Drift =
  | { state: "true" | "file"; changed: readonly string[] }
  | { state: "false" | "unknown" };

type RefState = "changed" | "file" | "unchanged" | "unknown";

type Assessed = { item: Item; since: string; refs: readonly { ref: CodeRef; state: RefState }[] };

const UNKNOWN: Drift = { state: "unknown" };
const UNCHANGED: Drift = { state: "false" };

const fileState = (history: History, since: string, ref: CodeRef): RefState => {
  const commits = commitsSince(history, since, ref);
  if (!commits) return "unknown";
  return commits.length > 0 ? "changed" : "unchanged";
};

const lineKey = (ref: CodeRef, since: string): string => `${rootKey(ref.root)}\0${since}`;

/** Files that changed and whose references name lines: only those need a diff. */
const lineChecks = (items: readonly Assessed[]): Map<string, LineCheck> => {
  const checks = new Map<string, LineCheck & { paths: Set<string> }>();
  for (const { since, refs } of items) {
    for (const { ref, state } of refs) {
      if (state !== "changed" || !ref.lines) continue;
      const key = lineKey(ref, since);
      const check = checks.get(key) ?? { root: ref.root, since, paths: new Set<string>() };
      check.paths.add(ref.path);
      checks.set(key, check);
    }
  }
  return checks;
};

const lineState = (hunks: Hunks | undefined, path: string, lines: LineRange): RefState => {
  if (!hunks) return "unknown";
  return (hunks.get(path) ?? []).some((hunk) => touches(hunk, lines)) ? "changed" : "file";
};

const named = (
  refs: readonly { ref: CodeRef; state: RefState }[],
  wanted: RefState,
  name: (ref: CodeRef) => string,
): string[] => [
  ...new Set(refs.filter(({ state }) => state === wanted).map(({ ref }) => name(ref))),
];

/** Named lines changing outweighs a change elsewhere in the file, which outweighs not knowing. */
const verdict = (refs: readonly { ref: CodeRef; state: RefState }[]): Drift => {
  const changed = named(refs, "changed", refText);
  if (changed.length > 0) return { state: "true", changed };
  const files = named(refs, "file", (ref) => ref.path);
  if (files.length > 0) return { state: "file", changed: files };
  return refs.some(({ state }) => state === "unknown") ? UNKNOWN : UNCHANGED;
};

const findDrifts = (index: StoreIndex): ReadonlyMap<Item, Drift> => {
  const history = codeHistory(index);
  const assessed: Assessed[] = [...history.items.values()].map(({ item, since, refs }) => ({
    item,
    since,
    refs: refs.map((ref) => ({ ref, state: fileState(history, since, ref) })),
  }));
  const hunks = new Map(
    [...lineChecks(assessed)].map(([key, check]) => [key, hunksSince(history.reads, check)]),
  );
  history.reads.memo.save();
  return new Map(
    assessed.map(({ item, since, refs }) => [
      item,
      verdict(
        refs.map(({ ref, state }) =>
          state === "changed" && ref.lines
            ? { ref, state: lineState(hunks.get(lineKey(ref, since)), ref.path, ref.lines) }
            : { ref, state },
        ),
      ),
    ]),
  );
};

const drifts = new WeakMap<StoreIndex, ReadonlyMap<Item, Drift>>();

/** Whether code the item points at changed after its own or its document's `checked`. */
export const itemDrift = (index: StoreIndex, item: Item): Drift => {
  const known = drifts.get(index) ?? findDrifts(index);
  drifts.set(index, known);
  return known.get(item) ?? UNKNOWN;
};
