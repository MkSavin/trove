import type { StoreIndex } from "../core/index/index.ts";
import type { Row } from "../core/index/rows.ts";
import { docHref, escapeHtml, table } from "./html.ts";

const LINKED_FIELDS = new Set(["path", "document"]);

const cell = (index: StoreIndex, field: string, value: string): string =>
  LINKED_FIELDS.has(field) && index.byRel.has(value)
    ? `<a href="${docHref(value)}">${escapeHtml(value)}</a>`
    : escapeHtml(value);

export const rowsTable = (
  index: StoreIndex,
  fields: readonly string[],
  rows: readonly Row[],
): string =>
  table(
    fields.map(escapeHtml),
    rows.map((row) => fields.map((field) => cell(index, field, row[field] ?? ""))),
  );
