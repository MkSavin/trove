import type { Document } from "../document/document.ts";
import type { LedgerRow, LedgerTable } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import type { Span } from "../markdown/tables.ts";
import type { Line } from "../text/lines.ts";
import { eolOf, insert, lineSpan, type Patch, replace } from "./patch.ts";

export const formatRow = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

export const removeRow = (doc: Document, row: LedgerRow): Patch =>
  replace(lineSpan(doc.lines, row.line), "");

const PIPE = "|";

/** The whole cell between its pipes is rewritten, so a padded column keeps its width when the text fits. */
const refill = (line: Line, span: Span, text: string): Patch => {
  const open = line.text.lastIndexOf(PIPE, span.start - line.start - 1);
  const close = line.text.indexOf(PIPE, span.end - line.start);
  if (close === -1) return replace(span, text);
  const cell = { start: line.start + open + 1, end: line.start + close };
  return replace(cell, ` ${text} `.padEnd(cell.end - cell.start));
};

const appendCells = (line: Line, cells: readonly string[]): Patch => {
  const body = line.text.trimEnd();
  const joined = cells.join(` ${PIPE} `);
  return insert(
    line.start + body.length,
    body.endsWith(PIPE) ? ` ${joined} ${PIPE}` : ` ${PIPE} ${joined}`,
  );
};

/** A row that leaves out trailing cells gets them added, empty up to `column`. */
export const setCell = (row: LedgerRow, column: number, text: string): Patch => {
  if (column < 0) throw new TroveError(`row at line ${row.line.number} has no such column`);
  const span = row.spans[column];
  if (span) return refill(row.line, span, text);
  const skipped = Array.from({ length: column - row.spans.length }, () => "");
  return appendCells(row.line, [...skipped, text]);
};

/** A new last column in the header; rows may leave it out until they get a value. */
export const appendColumn = (doc: Document, table: LedgerTable, label: string): Patch[] => {
  const header = table.header;
  const separator = header && doc.lines[header.line.number];
  if (!header || !separator) throw new TroveError(`${doc.rel}: ledger table without header`);
  return [appendCells(header.line, [label]), appendCells(separator, ["-".repeat(label.length)])];
};

/** Appends after the last row, or after the separator of an empty table. */
export const appendRow = (doc: Document, table: LedgerTable, cells: readonly string[]): Patch => {
  const header = table.header;
  if (!header) throw new TroveError(`${doc.rel}: ledger table without header`);
  const last = table.rows.at(-1)?.line ?? doc.lines[header.line.number];
  if (!last) throw new TroveError(`${doc.rel}: ledger table ends abruptly`);
  return insert(last.end, `${eolOf(doc.text)}${formatRow(cells)}`);
};
