import type { Item } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import { toplevel } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { columnLabel, groupTitle, rowField } from "../reports/cells.ts";
import { tableLines } from "../reports/section.ts";
import { compareNatural } from "../text/compare.ts";
import { itemsAt } from "./items-at.ts";
import { commitBefore } from "./since.ts";

type Args = Readonly<Record<string, string>>;

/** Each week's Monday and the items as they were when it began. */
export type TrendHistory = { starts: readonly string[]; snapshots: readonly (readonly Item[])[] };

type TrendOptions = {
  by: string | undefined;
  label: string | undefined;
  matches: (item: Item) => boolean;
  outputDir: string;
};

type Week = { start: string; before: ReadonlyMap<string, Item>; after: ReadonlyMap<string, Item> };

const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 104;
const WHOLE = /^\d+$/;
const EMPTY = "—";

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
  const reads = new Map<string, Promise<Item[]>>();
  const read = (commit: string): Promise<Item[]> => {
    const pending = reads.get(commit) ?? itemsAt(index, commit);
    reads.set(commit, pending);
    return pending;
  };
  const snapshots = await Promise.all(commits.map((commit) => (commit ? read(commit) : [])));
  return { starts, snapshots };
};

const openOf = (items: readonly Item[], matches: (item: Item) => boolean): Map<string, Item> =>
  new Map(items.filter((item) => !item.closed && matches(item)).map((item) => [item.id, item]));

/** Opened, closed during the week and open at its end, for the items `keep` lets through. */
const tally = (week: Week, keep: (item: Item) => boolean): number[] => {
  const after = [...week.after.values()].filter(keep);
  const opened = after.filter((item) => !week.before.has(item.id)).length;
  const closed = [...week.before.values()].filter(
    (item) => keep(item) && !week.after.has(item.id),
  ).length;
  return [opened, closed, after.length];
};

/**
 * Items opened and closed each week and open at its end, from the ledgers' git history; with
 * `by`, a row per week and value of that field. An item that took a new id counts as both.
 */
export const renderTrend = (
  history: TrendHistory,
  index: StoreIndex,
  { by, label, matches, outputDir }: TrendOptions,
): string[] => {
  const ends = [...history.snapshots.slice(1), index.items];
  const weeks: Week[] = history.starts.map((start, i) => ({
    start,
    before: openOf(history.snapshots[i] ?? [], matches),
    after: openOf(ends[i] ?? [], matches),
  }));
  const { week, trendOpened, trendClosed, trendOpen } = index.config.labels;
  const counts = [trendOpened, trendClosed, trendOpen];
  if (by === undefined)
    return tableLines(
      [week, ...counts],
      weeks.map((w) => [w.start, ...tally(w, () => true).map(String)]),
    );
  const fieldOf = (item: Item): string => rowField(item, by, index) ?? "";
  const header = label ?? columnLabel({ key: by, label: undefined, empty: undefined }, index);
  const rows = weeks.flatMap((w) => {
    const values = new Set([...w.before.values(), ...w.after.values()].map(fieldOf));
    return [...values]
      .toSorted(compareNatural)
      .map((value) => ({ value, numbers: tally(w, (item) => fieldOf(item) === value) }))
      .filter(({ numbers }) => numbers.some((n) => n > 0))
      .map(({ value, numbers }) => [
        w.start,
        groupTitle(value, by, outputDir) || EMPTY,
        ...numbers.map(String),
      ]);
  });
  return rows.length === 0 ? [EMPTY] : tableLines([week, header, ...counts], rows);
};
