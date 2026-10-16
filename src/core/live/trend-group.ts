import type { Item } from "../document/ledger.ts";
import type { StoreIndex } from "../index/index.ts";
import { documentField, itemDocument, itemField } from "../index/query.ts";

const BLANK = new Set(["", "—", "-"]);

const present = (value: string | undefined): string | undefined =>
  value === undefined || BLANK.has(value.trim()) ? undefined : value;

/**
 * The value an item is grouped by: its own field, else its document's field of that name, else
 * the `fallback` field (`section` is the heading above its table); empty when none has one.
 */
export const groupValue =
  (index: StoreIndex, by: string, fallback: string | undefined) =>
  (item: Item): string => {
    const doc = itemDocument(item, index);
    return (
      present(itemField(item, by, index)) ??
      present(doc && documentField(doc, by, index)) ??
      present(fallback === undefined ? undefined : itemField(item, fallback, index)) ??
      ""
    );
  };
