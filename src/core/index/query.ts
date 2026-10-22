import { basename } from "node:path";
import type { LedgerColumn } from "../config/schema.ts";
import { cellValues, isBlankCell } from "../document/cell.ts";
import type { Document } from "../document/document.ts";
import { staleDays } from "../document/freshness.ts";
import type { Item } from "../document/ledger.ts";
import { nextStage, progressBar, stageProgress } from "../document/progress.ts";
import { lastVerified } from "../verify/last.ts";
import { itemDrift } from "./drift.ts";
import type { StoreIndex } from "./index.ts";
import { fieldMatches } from "./match.ts";
import { pendingRefs } from "./waiting.ts";

/**
 * Field → wanted values. A value is exact (raw text or vocabulary key), `~text` for a substring,
 * a glob such as `audits/mobile/**`, or any of these behind `!` to exclude.
 */
export type Filters = Readonly<Record<string, readonly string[]>>;

const STATE = "state";
/** True while something named in `blocked_by` is still open. */
const WAITING = "waiting";
export const DRIFT = "drift";

export const documentField = (
  doc: Document,
  field: string,
  index: StoreIndex,
): string | undefined => {
  switch (field) {
    case "path":
    case "document":
      return doc.rel;
    case "name":
      return doc.name;
    case "place":
      return doc.place;
    case "folder":
      return doc.folder;
    case "stale":
      return String(staleDays(doc, index.config, index.today) !== undefined);
    case "note":
      return doc.statusLine?.parsed?.note || undefined;
    case WAITING:
      return String(pendingRefs(index, doc.meta.blocked_by).length > 0);
    case "progress":
      return stageProgress(doc.stages);
    case "bar":
      return progressBar(doc.stages);
    case "next":
      return nextStage(doc.stages);
    case "verified":
      return lastVerified(doc, index.verified);
    default:
      return doc.meta[field];
  }
};

/** An item read from history keeps its old path; a document moved since is found by name. */
export const itemDocument = (item: Item, index: StoreIndex): Document | undefined =>
  index.byRel.get(item.document) ?? index.byName.get(basename(item.document));

/** Ledger columns first; any other field reads the item's document, so `path=…` works on items. */
export const itemField = (item: Item, field: string, index: StoreIndex): string | undefined => {
  if (field === "document" || field === "path") return item.document;
  if (field === "section") return item.section;
  if (field === STATE) return item.closed ? "closed" : "open";
  if (field === WAITING) {
    return String(pendingRefs(index, itemField(item, "blocked_by", index)).length > 0);
  }
  if (field === DRIFT) return itemDrift(index, item).state;
  if (Object.hasOwn(item.values, field)) {
    const value = item.values[field];
    return isBlankCell(value) ? "" : value;
  }
  const doc = itemDocument(item, index);
  return doc ? documentField(doc, field, index) : undefined;
};

type Vocabulary = Readonly<Record<string, string>> | undefined;

const documentVocabulary = (field: string, index: StoreIndex): Vocabulary =>
  field === "status" ? index.config.statuses : undefined;

/** A column of the item's own ledger: a debt list may name its statuses differently. */
export const itemColumn = (
  item: Item,
  field: string,
  index: StoreIndex,
): LedgerColumn | undefined =>
  itemDocument(item, index)?.ledger?.config.columns.find((column) => column.key === field);

/** Each part of a `multiple` column, one empty value when it is blank; none for a missing field. */
export const itemValues = (item: Item, field: string, index: StoreIndex): string[] => {
  const value = itemField(item, field, index);
  if (value === undefined) return [];
  if (!itemColumn(item, field, index)?.multiple) return [value];
  const values = cellValues(value, true);
  return values.length > 0 ? values : [""];
};

export const selectDocuments = (index: StoreIndex, filters: Filters): Document[] =>
  index.documents.filter((doc) =>
    Object.entries(filters).every(([field, wanted]) =>
      fieldMatches(
        [documentField(doc, field, index)].filter((value) => value !== undefined),
        documentVocabulary(field, index),
        wanted,
      ),
    ),
  );

/** Whether an item passes the filters, closed or not. */
export const itemMatches =
  (index: StoreIndex, filters: Filters) =>
  (item: Item): boolean =>
    Object.entries(filters).every(([field, wanted]) =>
      fieldMatches(itemValues(item, field, index), itemColumn(item, field, index)?.enum, wanted),
    );

const PLACE_FIELDS = ["type", "path", "id"];

/** Items of an `apart` type, such as deferred work, pass only a filter that names where they are. */
export const itemShown =
  (index: StoreIndex, filters: Filters) =>
  (item: Item): boolean =>
    !index.byRel.get(item.document)?.typeConfig?.apart ||
    PLACE_FIELDS.some((field) => Object.hasOwn(filters, field));

export const itemPasses =
  (index: StoreIndex, filters: Filters) =>
  (item: Item): boolean =>
    itemShown(index, filters)(item) && itemMatches(index, filters)(item);

/** Closed items are left out unless the filter names `state`; see `itemShown` for the rest. */
export const selectItems = (index: StoreIndex, filters: Filters): Item[] =>
  index.items.filter(
    (item) => (!item.closed || Object.hasOwn(filters, STATE)) && itemPasses(index, filters)(item),
  );
