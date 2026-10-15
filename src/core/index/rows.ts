import { allLedgers } from "../config/vocabulary.ts";
import type { Item } from "../document/ledger.ts";
import type { StoreIndex } from "./index.ts";
import { documentField, type Filters, itemField, selectDocuments, selectItems } from "./query.ts";

export const KINDS = ["items", "documents"] as const;
export type Kind = (typeof KINDS)[number];

export type Row = Readonly<Record<string, string>>;

export type QueryResult = { fields: readonly string[]; rows: Row[] };

const DOCUMENT_FIELDS = ["path", "type", "status", "checked"];

export const isKind = (value: string | undefined): value is Kind =>
  KINDS.some((kind) => kind === value);

/** Columns of only the ledgers these items come from, so a debt list's columns stay off audit rows. */
const itemFields = (items: readonly Item[], index: StoreIndex): string[] => {
  const used = new Set(items.map((item) => index.byRel.get(item.document)?.ledger?.config));
  const columns = allLedgers(index.config)
    .filter((ledger) => used.has(ledger))
    .flatMap((ledger) => ledger.columns.map((column) => column.key));
  return [...new Set(["id", ...columns, "document"])];
};

const toRow = (fields: readonly string[], read: (field: string) => string | undefined): Row =>
  Object.fromEntries(fields.map((field) => [field, read(field) ?? ""]));

/** Matching items or documents as flat records, in the requested field order or a fitting default. */
export const queryRows = (
  index: StoreIndex,
  kind: Kind,
  filters: Filters,
  requested?: readonly string[],
): QueryResult => {
  if (kind === "documents") {
    const fields = requested ?? DOCUMENT_FIELDS;
    const rows = selectDocuments(index, filters).map((doc) =>
      toRow(fields, (field) => documentField(doc, field, index)),
    );
    return { fields, rows };
  }
  const items = selectItems(index, filters);
  const fields = requested ?? itemFields(items, index);
  const rows = items.map((item) => toRow(fields, (field) => itemField(item, field, index)));
  return { fields, rows };
};
