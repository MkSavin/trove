import { allLedgers } from "../config/vocabulary.ts";
import type { StoreIndex } from "./index.ts";
import { documentField, type Filters, itemField, selectDocuments, selectItems } from "./query.ts";

export const KINDS = ["items", "documents"] as const;
export type Kind = (typeof KINDS)[number];

export type Row = Readonly<Record<string, string>>;

const DOCUMENT_FIELDS = ["path", "type", "status", "checked"];

export const isKind = (value: string | undefined): value is Kind =>
  KINDS.some((kind) => kind === value);

export const defaultFields = (kind: Kind, index: StoreIndex): string[] =>
  kind === "documents"
    ? DOCUMENT_FIELDS
    : [
        ...new Set(allLedgers(index.config).flatMap((ledger) => ledger.columns.map((c) => c.key))),
        "document",
      ];

/** Matching items or documents as flat records, in the requested field order. */
export const queryRows = (
  index: StoreIndex,
  kind: Kind,
  filters: Filters,
  fields: readonly string[] = defaultFields(kind, index),
): Row[] =>
  kind === "documents"
    ? selectDocuments(index, filters).map((doc) =>
        Object.fromEntries(fields.map((field) => [field, documentField(doc, field, index) ?? ""])),
      )
    : selectItems(index, filters).map((item) =>
        Object.fromEntries(fields.map((field) => [field, itemField(item, field, index) ?? ""])),
      );
