import type { Item } from "../document/ledger.ts";
import type { StoreIndex } from "../index/index.ts";
import { columnLabel, groupTitle } from "../reports/cells.ts";
import { groupByField, tableLines } from "../reports/section.ts";
import { compareNatural } from "../text/compare.ts";
import { changeLabels } from "./changes.ts";

const CHANGE = "change";

type CountOptions = { by?: string | undefined; label?: string | undefined; outputDir: string };

const column = (key: string) => ({ key, label: undefined, empty: undefined });

const countOf = (rows: readonly Item[], change: string): number =>
  rows.filter((row) => row.values.change === change).length;

/**
 * How many items each change holds; with `by`, one row per value of that field and a column per
 * change that occurs.
 */
export const renderChangeCounts = (
  rows: readonly Item[],
  index: StoreIndex,
  { by, label, outputDir }: CountOptions,
): string[] => {
  const changes = changeLabels(index.config).filter((change) => countOf(rows, change) > 0);
  if (by === undefined || by === CHANGE) {
    return tableLines(
      [label ?? index.config.labels.change, index.config.labels.count],
      changes.map((change) => [change, String(countOf(rows, change))]),
    );
  }
  const groups = [...groupByField(rows, by, index)].toSorted(([a], [b]) => compareNatural(a, b));
  return tableLines(
    [label ?? columnLabel(column(by), index), ...changes],
    groups.map(([value, members]) => [
      groupTitle(value, by, outputDir) || "—",
      ...changes.map((change) => String(countOf(members, change))),
    ]),
  );
};
