import type { Document } from "../document/document.ts";
import type { LedgerRow, LedgerTable } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import { eolOf, insert, lineSpan, type Patch, replace } from "./patch.ts";

export const formatRow = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

export const removeRow = (doc: Document, row: LedgerRow): Patch =>
  replace(lineSpan(doc.lines, row.line), "");

export const setCell = (row: LedgerRow, column: number, text: string): Patch => {
  const span = row.spans[column];
  if (!span) throw new TroveError(`row at line ${row.line.number} has no column ${column + 1}`);
  return replace(span, text);
};

/** Appends after the last row, or after the separator of an empty table. */
export const appendRow = (doc: Document, table: LedgerTable, cells: readonly string[]): Patch => {
  const header = table.header;
  if (!header) throw new TroveError(`${doc.rel}: ledger table without header`);
  const last = table.rows.at(-1)?.line ?? doc.lines[header.line.number];
  if (!last) throw new TroveError(`${doc.rel}: ledger table ends abruptly`);
  return insert(last.end, `${eolOf(doc.text)}${formatRow(cells)}`);
};
