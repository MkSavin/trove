import type { Document } from "../document/document.ts";
import { staleDays } from "../document/freshness.ts";
import type { Item } from "../document/ledger.ts";
import { nextStage, progressBar, stageProgress } from "../document/progress.ts";
import { lastVerified } from "../verify/last.ts";
import { driftedFiles } from "./drift.ts";
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

/** Ledger columns first; any other field reads the item's document, so `path=…` works on items. */
export const itemField = (item: Item, field: string, index: StoreIndex): string | undefined => {
  if (field === "document") return item.document;
  if (field === "section") return item.section;
  if (field === STATE) return item.closed ? "closed" : "open";
  if (field === WAITING) {
    return String(pendingRefs(index, itemField(item, "blocked_by", index)).length > 0);
  }
  if (field === DRIFT) return String(driftedFiles(index, item) !== undefined);
  if (Object.hasOwn(item.values, field)) return item.values[field];
  const doc = index.byRel.get(item.document);
  return doc ? documentField(doc, field, index) : undefined;
};

type Vocabulary = Readonly<Record<string, string>> | undefined;

const documentVocabulary = (field: string, index: StoreIndex): Vocabulary =>
  field === "status" ? index.config.statuses : undefined;

/** The vocabulary of the item's own ledger: a debt list may name its statuses differently. */
const itemVocabulary = (item: Item, field: string, index: StoreIndex): Vocabulary =>
  index.byRel.get(item.document)?.ledger?.config.columns.find((column) => column.key === field)
    ?.enum;

export const selectDocuments = (index: StoreIndex, filters: Filters): Document[] =>
  index.documents.filter((doc) =>
    Object.entries(filters).every(([field, wanted]) =>
      fieldMatches(documentField(doc, field, index), documentVocabulary(field, index), wanted),
    ),
  );

/** Whether an item passes the filters, closed or not. */
export const itemMatches =
  (index: StoreIndex, filters: Filters) =>
  (item: Item): boolean =>
    Object.entries(filters).every(([field, wanted]) =>
      fieldMatches(itemField(item, field, index), itemVocabulary(item, field, index), wanted),
    );

/** Closed items are left out unless the filter names `state`. */
export const selectItems = (index: StoreIndex, filters: Filters): Item[] =>
  index.items.filter(
    (item) => (!item.closed || Object.hasOwn(filters, STATE)) && itemMatches(index, filters)(item),
  );
