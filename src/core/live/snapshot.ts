import type { Document } from "../document/document.ts";
import type { StoreIndex } from "../index/index.ts";

/** Generated blocks stay as they are: archived documents, and summaries after their own date. */
export const isSnapshot = (doc: Document, index: StoreIndex): boolean => {
  if (doc.place === "archive") return true;
  const summaryTypes = new Set(Object.values(index.config.summaries).map((kind) => kind.type));
  return summaryTypes.has(doc.type ?? "") && (doc.meta.date ?? index.today) < index.today;
};
