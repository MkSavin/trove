import type { Document } from "../../core/document/document.ts";
import type { StoreIndex } from "../../core/index/index.ts";
import { findDocument } from "../../core/index/resolve.ts";
import { escapeHtml, table } from "../html.ts";
import { renderStoreMarkdown } from "../store-markdown.ts";
import type { Page } from "./page.ts";

const headerTable = (doc: Document): string =>
  Object.keys(doc.meta).length === 0
    ? ""
    : table(
        ["field", "value"],
        Object.entries(doc.meta).map(([key, value]) => [escapeHtml(key), escapeHtml(value)]),
      );

export const documentPage = (index: StoreIndex, ref: string): Page => {
  const doc = findDocument(index, ref);
  if (!doc) {
    return { title: "Not found", body: `<p>No document ${escapeHtml(ref)}.</p>`, status: 404 };
  }
  const path = `<p class="muted">${escapeHtml(doc.rel)}</p>`;
  return {
    title: doc.name,
    body: `${path}${headerTable(doc)}${renderStoreMarkdown(index, doc.text, doc.rel)}`,
  };
};
