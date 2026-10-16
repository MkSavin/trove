import { isBlankCell } from "../document/cell.ts";
import type { Item } from "../document/ledger.ts";
import type { StoreIndex } from "../index/index.ts";
import { documentField, itemDocument, itemValues } from "../index/query.ts";

const present = (values: readonly (string | undefined)[]): string[] =>
  values.filter((value): value is string => !isBlankCell(value));

/**
 * The values an item is grouped by: its own field, else its document's field of that name, else
 * the `fallback` field (`section` is the heading above its table); one empty value when none has one.
 */
export const groupValues =
  (index: StoreIndex, by: string, fallback: string | undefined) =>
  (item: Item): string[] => {
    const doc = itemDocument(item, index);
    const candidates = [
      () => present(itemValues(item, by, index)),
      () => present([doc && documentField(doc, by, index)]),
      () => present(fallback === undefined ? [] : itemValues(item, fallback, index)),
    ];
    for (const candidate of candidates) {
      const values = candidate();
      if (values.length > 0) return [...new Set(values)];
    }
    return [""];
  };
