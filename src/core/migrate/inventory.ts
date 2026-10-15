import type { StoreIndex } from "../index/index.ts";
import { compareText } from "../text/compare.ts";

/** Counts that must come out of a migration unchanged. */
export type Inventory = Readonly<Record<string, number>>;

const tally = (keys: readonly string[]): Record<string, number> =>
  Object.fromEntries([...Map.groupBy(keys, (key) => key)].map(([key, all]) => [key, all.length]));

export const takeInventory = (index: StoreIndex): Inventory => {
  const counts = {
    documents: index.documents.length,
    ledgers: index.documents.filter((doc) => doc.ledger).length,
    items: index.items.length,
    ...tally(index.documents.map((doc) => `${doc.place}: ${doc.type ?? "?"}`)),
    ...tally(index.items.map((item) => `items: ${item.values.status ?? "?"}`)),
  };
  return Object.fromEntries(Object.entries(counts).toSorted(([a], [b]) => compareText(a, b)));
};

export const inventoryChanges = (before: Inventory, after: Inventory): string[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key])
    .map((key) => `${key}: ${before[key] ?? 0} → ${after[key] ?? 0}`);
