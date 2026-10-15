import type { LedgerConfig } from "../config/schema.ts";
import { keyOf } from "../config/vocabulary.ts";
import type { Block } from "../markdown/blocks.ts";
import type { Heading } from "../markdown/headings.ts";
import { parseTables, type Table, type TableRow } from "../markdown/tables.ts";

export type Item = {
  id: string;
  /** Status key; missing when the cell is outside the vocabulary. */
  status: string | undefined;
  /** Counted as open by its ledger: keeps the document out of the archive. */
  open: boolean;
  /** Sits in the ledger of closed items of a `resolved-of` document. */
  closed: boolean;
  /** Raw cell text by column key. */
  values: Readonly<Record<string, string>>;
  document: string;
  /** The heading above the item's table, e.g. a team in a debt list. */
  section: string | undefined;
  line: number;
};

export type LedgerRow = TableRow & { item: Item | undefined };

export type LedgerTable = {
  header: TableRow | undefined;
  /** Column key per header cell; missing for labels the config does not know. */
  keys: readonly (string | undefined)[];
  section: string | undefined;
  rows: readonly LedgerRow[];
};

export type Ledger = {
  config: LedgerConfig;
  blocks: readonly Block[];
  tables: readonly LedgerTable[];
  items: readonly Item[];
};

type Context = {
  document: string;
  config: LedgerConfig;
  closed: boolean;
  section: string | undefined;
};

const toItem = (
  row: TableRow,
  keys: readonly (string | undefined)[],
  context: Context,
): Item | undefined => {
  if (row.cells.length !== keys.length) return undefined;
  const values = Object.fromEntries(
    keys.flatMap((key, i) => (key ? [[key, row.cells[i] ?? ""]] : [])),
  );
  if (!values.id) return undefined;

  const statusEnum = context.config.columns.find((column) => column.key === "status")?.enum;
  const raw = values.status ?? "";
  const status = statusEnum ? keyOf(statusEnum, raw) : raw;
  return {
    id: values.id,
    status,
    open: status !== undefined && context.config.open.includes(status),
    closed: context.closed,
    values,
    document: context.document,
    section: context.section,
    line: row.line.number,
  };
};

const sectionAbove = (headings: readonly Heading[], line: number): string | undefined =>
  headings.filter((heading) => heading.line < line).at(-1)?.title;

const toLedgerTable = (
  table: Table,
  context: Omit<Context, "section">,
  headings: readonly Heading[],
): LedgerTable => {
  const keys = (table.header?.cells ?? []).map(
    (label) =>
      context.config.columns.find((column) => column.label === label || column.key === label)?.key,
  );
  const firstLine = table.header?.line.number ?? table.rows[0]?.line.number ?? 0;
  const section = sectionAbove(headings, firstLine);
  const rows = table.rows.map((row) => ({
    ...row,
    item: toItem(row, keys, { ...context, section }),
  }));
  return { header: table.header, keys, section, rows };
};

export const readLedger = (
  blocks: readonly Block[],
  document: string,
  config: LedgerConfig,
  headings: readonly Heading[],
  closed = false,
): Ledger => {
  const tables = blocks.flatMap((block) =>
    parseTables(block.inner).map((table) =>
      toLedgerTable(table, { document, config, closed }, headings),
    ),
  );
  const items = tables.flatMap((table) =>
    table.rows.flatMap((row) => (row.item ? [row.item] : [])),
  );
  return { config, blocks, tables, items };
};
