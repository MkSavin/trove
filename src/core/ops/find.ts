import type { Document } from "../document/document.ts";
import type { Item, LedgerRow, LedgerTable } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { findDocument, idToken } from "../index/resolve.ts";
import { withoutLiveBlocks } from "../live/blocks.ts";

export type LocatedItem = { item: Item; doc: Document; table: LedgerTable; row: LedgerRow };

export const requireDocument = (index: StoreIndex, name: string): Document => {
  const doc = findDocument(index, name);
  if (!doc) throw new TroveError(`no document ${name}`);
  return doc;
};

export const requireItem = (index: StoreIndex, id: string): LocatedItem => {
  for (const doc of index.documents) {
    for (const table of doc.ledger?.tables ?? []) {
      const row = table.rows.find((candidate) => candidate.item?.id === id);
      if (row?.item) return { item: row.item, doc, table, row };
    }
  }
  throw new TroveError(`no item ${id} in any ledger`);
};

/** Other documents that still mention the id; generated reports are not documents. */
export const mentionsOf = (index: StoreIndex, id: string, except: string): string[] => {
  const token = idToken(id);
  return index.documents
    .filter((doc) => doc.rel !== except && token.test(withoutLiveBlocks(doc.text)))
    .map((doc) => doc.rel);
};
