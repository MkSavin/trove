import type { Item } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import { toplevel } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { columnLabel, groupTitle } from "../reports/cells.ts";
import { tableLines } from "../reports/section.ts";
import { compareNatural } from "../text/compare.ts";
import { baseOf, closedSince } from "./closed-after.ts";
import { isLive } from "./item-state.ts";
import { itemsAt } from "./items-at.ts";
import { commitBefore } from "./since.ts";
import { storeAt } from "./store-start.ts";
import { eventSubject, type TrendKind, weekEvents } from "./trend-events.ts";
import { groupValue } from "./trend-group.ts";

type Args = Readonly<Record<string, string>>;

/**
 * Each week's Monday and the items as they were when it began; none before the store existed.
 * `closedIn` holds, per week, the items absent at its start that provably closed in it.
 */
export type TrendHistory = {
  starts: readonly string[];
  snapshots: readonly (readonly Item[] | undefined)[];
  closedIn: readonly ReadonlySet<string>[];
};

type TrendOptions = {
  by: string | undefined;
  fallback: string | undefined;
  label: string | undefined;
  matches: (item: Item) => boolean;
  outputDir: string;
};

/** Events are missing for the week the store began: it shows the items it started with. */
type Week = {
  start: string;
  open: readonly Item[];
  events: readonly { kind: TrendKind; item: Item }[] | undefined;
};

const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 104;
const WHOLE = /^\d+$/;
const EMPTY = "—";
const KINDS: readonly TrendKind[] = ["opened", "closed", "moved"];

export const trendKey = (args: Args): string => JSON.stringify([args.weeks ?? ""]);

const weekCount = (args: Args): number => {
  const weeks = Number(args.weeks ?? DEFAULT_WEEKS);
  if (!WHOLE.test(String(weeks)) || weeks < 1 || weeks > MAX_WEEKS)
    throw new TroveError(`weeks=${args.weeks}: give a number of weeks from 1 to ${MAX_WEEKS}`);
  return weeks;
};

/** Mondays of the last weeks, oldest first; the last one starts the current week. */
const weekStarts = (today: string, weeks: number): string[] => {
  const date = Temporal.PlainDate.from(today);
  const monday = date.subtract({ days: date.dayOfWeek - 1 });
  return Array.from({ length: weeks }, (_, i) =>
    monday.subtract({ weeks: weeks - 1 - i }).toString(),
  );
};

export const loadTrend = async (index: StoreIndex, args: Args): Promise<TrendHistory> => {
  if (!(await toplevel(index.root)))
    throw new TroveError("trove:trend reads the store's git history: the store has none");
  const starts = weekStarts(index.today, weekCount(args));
  const commits = await Promise.all(
    starts.map(async (start) => (await commitBefore(index.root, start)).commit),
  );
  const reads = new Map<string, Promise<Item[] | undefined>>();
  const read = (commit: string): Promise<Item[] | undefined> => {
    const pending =
      reads.get(commit) ??
      storeAt(index.root, commit).then((found) => (found ? itemsAt(index, commit) : undefined));
    reads.set(commit, pending);
    return pending;
  };
  const snapshots = await Promise.all(commits.map((commit) => (commit ? read(commit) : undefined)));
  const closedIn = await Promise.all(
    snapshots.map(async (before, i) => {
      const commit = commits[i];
      const after = i + 1 < snapshots.length ? snapshots[i + 1] : index.items;
      if (!before || !after || !commit) return new Set<string>();
      return closedSince(index, before, after, await baseOf(index.root, commit));
    }),
  );
  return { starts, snapshots, closedIn };
};

/** Weeks the store existed by their end; ones wholly before it are left out. */
const weeksOf = (
  history: TrendHistory,
  index: StoreIndex,
  matches: (item: Item) => boolean,
): Week[] => {
  const ends = [...history.snapshots.slice(1), index.items];
  return history.starts.flatMap((start, i) => {
    const after = ends[i];
    if (!after) return [];
    const before = history.snapshots[i];
    const open = after.filter((item) => isLive(item, index.config) && matches(item));
    const events =
      before &&
      weekEvents(index, before, after, history.closedIn[i] ?? new Set()).flatMap((event) => {
        const item = eventSubject(event, matches);
        return item ? [{ kind: event.kind, item }] : [];
      });
    return [{ start, open, events }];
  });
};

/** Opened, closed, moved and open at the end, for the items `keep` lets through. */
const tally = (week: Week, keep: (item: Item) => boolean): (number | undefined)[] => [
  ...KINDS.map(
    (kind) => week.events?.filter((event) => event.kind === kind && keep(event.item)).length,
  ),
  week.open.filter(keep).length,
];

const cells = (numbers: readonly (number | undefined)[]): string[] =>
  numbers.map((n) => (n === undefined ? EMPTY : String(n)));

/**
 * Items opened, closed and moved each week and open at its end, from the ledgers' git history;
 * with `by`, a row per week and value of that field, a move counting where the item was.
 */
export const renderTrend = (
  history: TrendHistory,
  index: StoreIndex,
  { by, fallback, label, matches, outputDir }: TrendOptions,
): string[] => {
  const weeks = weeksOf(history, index, matches);
  const { week, trendOpened, trendClosed, trendMoved, trendOpen, trendStart } = index.config.labels;
  const counts = [trendOpened, trendClosed, trendMoved, trendOpen];
  const weekCell = (w: Week) => (w.events ? w.start : `${w.start} (${trendStart})`);
  if (by === undefined)
    return tableLines(
      [week, ...counts],
      weeks.map((w) => [weekCell(w), ...cells(tally(w, () => true))]),
    );
  const fieldOf = groupValue(index, by, fallback);
  const header = label ?? columnLabel({ key: by, label: undefined, empty: undefined }, index);
  const rows = weeks.flatMap((w) => {
    const values = new Set([...w.open, ...(w.events ?? []).map((e) => e.item)].map(fieldOf));
    return [...values]
      .toSorted(compareNatural)
      .map((value) => ({ value, numbers: tally(w, (item) => fieldOf(item) === value) }))
      .filter(({ numbers }) => numbers.some((n) => n !== undefined && n > 0))
      .map(({ value, numbers }) => [
        weekCell(w),
        groupTitle(value, by, outputDir) || EMPTY,
        ...cells(numbers),
      ]);
  });
  return rows.length === 0 ? [EMPTY] : tableLines([week, header, ...counts], rows);
};
