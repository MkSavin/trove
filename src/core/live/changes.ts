import { basename, posix } from "node:path";
import type { Config } from "../config/schema.ts";
import type { Item } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import { toplevel } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { documentCell, type MovedItem } from "../reports/cells.ts";
import { compareNatural } from "../text/compare.ts";
import { baseOf, closedSince } from "./closed-after.ts";
import type { BlockSource } from "./git-data.ts";
import { baseRel, currentRel, isLive } from "./item-state.ts";
import { itemsAt } from "./items-at.ts";
import { movedOut } from "./moved-out.ts";
import { startOf } from "./since.ts";
import { type MovedBase, startWithStore } from "./store-start.ts";

type Args = Readonly<Record<string, string>>;

/**
 * The items as they were at the starting point; `before` is missing when there is none.
 * `closedSince` holds the items absent then that provably closed after it.
 */
export type Baseline = {
  before: readonly Item[] | undefined;
  closedSince?: ReadonlySet<string> | undefined;
  moved?: MovedBase | undefined;
};

type Change = "closed" | "added" | "moved";

const ORDER: readonly Change[] = ["closed", "added", "moved"];

const LABEL = {
  closed: "changeClosed",
  added: "changeAdded",
  moved: "changeMoved",
} as const satisfies Record<Change, keyof Config["labels"]>;

export const changesKey = (rel: string, args: Args): string =>
  JSON.stringify([rel, args.since ?? "previous"]);

export const loadChanges = async (
  index: StoreIndex,
  source: BlockSource,
  args: Args,
): Promise<Baseline> => {
  if (!(await toplevel(index.root)))
    throw new TroveError("trove:changes reads the store's git history: the store has none");
  const start = await startOf(index, source, args.since ?? "previous");
  if (!start) return { before: undefined };
  const { commit, moved } = await startWithStore(index.root, start);
  if (!commit) return { before: [], moved };
  const before = await itemsAt(index, commit);
  const base = await baseOf(index.root, commit);
  return { before, closedSince: await closedSince(index, before, index.items, base), moved };
};

const changeOf = (
  config: Config,
  then: Item | undefined,
  now: Item | undefined,
  closedLater: boolean,
): Change | undefined => {
  const wasOpen = isLive(then, config);
  if (isLive(now, config)) {
    if (!wasOpen) return "added";
    return basename(then.document) === basename(now.document) ? undefined : "moved";
  }
  if (now === undefined) return wasOpen ? "closed" : undefined;
  return (then === undefined ? closedLater : wasOpen) ? "closed" : undefined;
};

/** The change values in the order rows come in. */
export const changeLabels = (config: Config): string[] =>
  ORDER.map((change) => config.labels[LABEL[change]]);

/** The line saying the start moved to the store's first commit, filled from `baseMoved`. */
export const baseNote = (config: Config, moved: MovedBase): string =>
  config.labels.baseMoved
    .replaceAll("{commit}", moved.commit.slice(0, 7))
    .replaceAll("{date}", moved.date)
    .replaceAll("{since}", moved.on);

type Row = {
  change: Change;
  item: Item;
  from: string | undefined;
  to: string | undefined;
  /** Where a moved item went, when that is known. */
  into: string | undefined;
  /** Where the item is now, when it is counted elsewhere. */
  current: string | undefined;
};

/**
 * Closed and moved items count in the document they were in at the start, else in the base of
 * the companion they sit in; an item closed as moved counts as moved.
 */
const rowOf = (
  index: StoreIndex,
  before: Item | undefined,
  after: Item | undefined,
  now: ReadonlyMap<string, Item>,
  closedLater: boolean,
): Row | undefined => {
  const found = changeOf(index.config, before, after, closedLater);
  const item = after ?? before;
  if (!found || !item) return undefined;
  const from = before && currentRel(index, before.document);
  const moved =
    found === "closed" && before && from ? movedOut(index, before, after, from) : undefined;
  const change = moved ? "moved" : found;
  const target = moved?.to === undefined ? undefined : now.get(moved.to);
  const current = currentRel(index, target?.document ?? item.document);
  const document = change === "added" ? current : (from ?? baseRel(index, current));
  const into = change === "moved" && (!moved || target) ? current : undefined;
  return {
    change,
    item: { ...item, document, closed: item.closed || found === "closed" },
    from: change === "moved" ? from : undefined,
    to: moved?.to,
    into: into === document ? undefined : into,
    current: current === document ? undefined : current,
  };
};

/**
 * Items closed, added and moved since the baseline, as items with a `change` value and, for
 * moves, `from` and, when the item took a new id, `to`; that new id is not listed as added.
 * An item passes `matches` in the document it counts in or in the one it is in now.
 */
export const changeRows = (
  index: StoreIndex,
  { before, closedSince: closed }: Baseline,
  matches: (item: Item) => boolean,
): (Item | MovedItem)[] => {
  const then = new Map((before ?? []).map((item) => [item.id, item]));
  const now = new Map(index.items.map((item) => [item.id, item]));
  const rows = [...new Set([...then.keys(), ...now.keys()])].flatMap((id) => {
    const row = rowOf(index, then.get(id), now.get(id), now, closed?.has(id) ?? false);
    return row ? [row] : [];
  });
  const targets = new Set(rows.map((row) => row.to));
  return rows
    .filter((row) => row.change !== "added" || !targets.has(row.item.id))
    .toSorted(
      (a, b) =>
        ORDER.indexOf(a.change) - ORDER.indexOf(b.change) || compareNatural(a.item.id, b.item.id),
    )
    .flatMap(({ change, item, from, to, into, current }) => {
      const values = {
        ...item.values,
        change: index.config.labels[LABEL[change]],
        ...(from === undefined
          ? {}
          : { from: documentCell(from, index, posix.dirname(item.document)) }),
        ...(to === undefined ? {} : { to }),
      };
      const row = { ...item, values, ...(into === undefined ? {} : { movedTo: into }) };
      return matches(row) || (current !== undefined && matches({ ...row, document: current }))
        ? [row]
        : [];
    });
};
