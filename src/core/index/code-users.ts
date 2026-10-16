import { type Document, stemOf } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { documentCodeRefs, itemCodeRefs, refText } from "./code-refs.ts";
import { type CodeTarget, targetMatches } from "./code-target.ts";
import type { StoreIndex } from "./index.ts";
import type { CodeRef } from "./links.ts";
import type { QueryResult, Row } from "./rows.ts";

export const CODE_USER_FIELDS = ["id", "what", "status", "document", "lines"] as const;

type Found<T> = { of: T; refs: readonly CodeRef[] };

const found = <T>(of: T, refs: readonly CodeRef[], target: CodeTarget): Found<T>[] => {
  const hits = refs.filter((ref) => targetMatches(target, ref));
  return hits.length > 0 ? [{ of, refs: hits }] : [];
};

const linesCell = (refs: readonly CodeRef[]): string => refs.map(refText).join(", ");

const itemRow = ({ of: item, refs }: Found<Item>): Row => ({
  id: item.id,
  what: item.values.what ?? "",
  status: item.values.status ?? "",
  document: item.document,
  lines: linesCell(refs),
});

const documentRow = ({ of: doc, refs }: Found<Document>): Row => ({
  id: stemOf(doc),
  what: doc.headings.find((heading) => heading.level === 1)?.title ?? doc.meta.scope ?? "",
  status: doc.meta.status ?? "",
  document: doc.rel,
  lines: linesCell(refs),
});

/**
 * Items and ledger-less documents, such as plans and specs, that point at the target.
 * Closed items and archived documents only with `all`.
 */
export const codeUsers = (index: StoreIndex, target: CodeTarget, all: boolean): QueryResult => {
  const items = index.items
    .filter((item) => all || !item.closed)
    .flatMap((item) => {
      const doc = index.byRel.get(item.document);
      return doc ? found(item, itemCodeRefs(index, doc, item), target) : [];
    });
  const documents = index.documents
    .filter((doc) => !doc.ledger && (all || doc.place === "work"))
    .flatMap((doc) => found(doc, documentCodeRefs(index, doc), target));
  return {
    fields: CODE_USER_FIELDS,
    rows: [...items.map(itemRow), ...documents.map(documentRow)],
  };
};
