import { basename, posix } from "node:path";
import type { ReportColumn } from "../config/schema.ts";
import { allLedgers } from "../config/vocabulary.ts";
import type { Document } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { rebaseText } from "../edit/links.ts";
import { type Drift, itemDrift } from "../index/drift.ts";
import type { StoreIndex } from "../index/index.ts";
import { DRIFT, documentField, itemField } from "../index/query.ts";

export type ReportRow = Document | Item;

const EMPTY = "—";
const UNCHECKED = "?";
const DOCUMENT_COLUMN = "document";

export const isDocument = (row: ReportRow): row is Document => "rel" in row;

const linkTo = (rel: string, outputDir: string): string =>
  `[${basename(rel, ".md")}](${posix.relative(outputDir, rel)})`;

/** A link while the document exists; an item that left the store keeps only its old name. */
export const documentCell = (rel: string, index: StoreIndex, outputDir: string): string =>
  index.byRel.has(rel) ? linkTo(rel, outputDir) : basename(rel, ".md");

/** Groups of documents read as links to them; other groups as their value. */
export const groupTitle = (name: string, key: string, outputDir: string): string =>
  key === DOCUMENT_COLUMN && name ? linkTo(name, outputDir) : name;

export const rowField = (row: ReportRow, key: string, index: StoreIndex): string | undefined =>
  isDocument(row) ? documentField(row, key, index) : itemField(row, key, index);

export const columnLabel = (column: ReportColumn, index: StoreIndex): string =>
  column.label ??
  allLedgers(index.config)
    .flatMap((ledger) => ledger.columns)
    .find((ledgerColumn) => ledgerColumn.key === column.key)?.label ??
  column.key;

/** A drifted item's cell names what changed; filters still see `true` or `file`. */
const driftCell = (drift: Drift): string | undefined => {
  if (drift.state === "true") return drift.changed.join(", ");
  if (drift.state === "file")
    return drift.changed.map((path) => `${path} (other lines)`).join(", ");
  return drift.state === "unknown" ? UNCHECKED : undefined;
};

const cellValue = (
  row: ReportRow,
  key: string,
  index: StoreIndex,
  outputDir: string,
): string | undefined => {
  if (key === DOCUMENT_COLUMN)
    return documentCell(isDocument(row) ? row.rel : row.document, index, outputDir);
  if (key === DRIFT && !isDocument(row)) return driftCell(itemDrift(index, row));
  const value = rowField(row, key, index);
  const source = posix.dirname(isDocument(row) ? row.rel : row.document);
  return value === undefined ? undefined : rebaseText(value, source, outputDir);
};

/** Cell text with links relative to the report file, so they work wherever it is opened. */
export const cellText = (
  row: ReportRow,
  column: ReportColumn,
  index: StoreIndex,
  outputDir: string,
): string => {
  const value = cellValue(row, column.key, index, outputDir);
  return value ? value.replaceAll("|", "\\|") : (column.empty ?? EMPTY);
};
