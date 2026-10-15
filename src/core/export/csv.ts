import type { Row } from "../index/rows.ts";

const NEEDS_QUOTES = /[",\r\n]/;

const cell = (value: string): string =>
  NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** RFC 4180 text with a header row, CRLF line ends, as spreadsheets and CRMs expect. */
export const toCsv = (rows: readonly Row[], fields: readonly string[]): string =>
  [fields, ...rows.map((row) => fields.map((field) => row[field] ?? ""))]
    .map((values) => values.map(cell).join(","))
    .join("\r\n")
    .concat("\r\n");
