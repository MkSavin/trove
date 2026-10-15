import type { LedgerConfig } from "../config/schema.ts";
import { labelOf } from "../config/vocabulary.ts";
import type { Document } from "../document/document.ts";
import type { LedgerTable } from "../document/ledger.ts";
import { appendRow } from "../edit/ledger.ts";
import { applyPatches, eolOf, insert } from "../edit/patch.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { itemHeading } from "../index/resolve.ts";
import { requireDocument } from "./find.ts";
import { idPrefix, nextNumber } from "./ids.ts";
import type { Plan } from "./plan.ts";

export type NewItem = {
  document: string;
  /** Cell text by column key; `status` defaults to the first open status. */
  values: Readonly<Record<string, string>>;
};

const DEFAULT_LEVEL = 3;
const FIELD = /\{(\w+)\}/g;
const LINE_BREAK = /\r?\n/;

const fillItem = (template: string, values: Readonly<Record<string, string>>): string =>
  template.replace(FIELD, (whole, key: string) => values[key] ?? whole);

/** The heading of a new item's section by `ledger.heading`, then `ledger.stub` under it. */
export const itemSection = (
  ledger: LedgerConfig,
  values: Readonly<Record<string, string>>,
  level: number,
  eol: string,
): string => {
  const heading = `${"#".repeat(level)} ${fillItem(ledger.heading, values)}`;
  const stub = ledger.stub
    ? ["", ...fillItem(ledger.stub.trimEnd(), values).split(LINE_BREAK)]
    : [];
  return `${[heading, ...stub].join(eol)}${eol}`;
};

/** The table under the named heading; else the one whose rows share the owner; else the last. */
export const pickTable = (
  doc: Document,
  values: Readonly<Record<string, string | undefined>>,
): LedgerTable => {
  const tables = (doc.ledger?.tables ?? []).filter((table) => table.header);
  if (values.section !== undefined) {
    const named = tables.find((table) => table.section === values.section);
    if (!named) {
      const known = tables.map((table) => table.section ?? "(none)").join(", ");
      throw new TroveError(
        `${doc.rel} has no ledger table under ${values.section}; known: ${known}`,
      );
    }
    return named;
  }
  const owned = tables.find((table) =>
    table.rows.some((row) => row.item?.values.owner === values.owner),
  );
  const table = owned ?? tables.at(-1);
  if (!table) throw new TroveError(`${doc.rel} has no ledger table`);
  return table;
};

/** Same level as the sections of the items already there. */
export const sectionLevel = (doc: Document): number => {
  const ids = doc.ledger?.items.map((item) => item.id) ?? [];
  const heading = ids.map((id) => itemHeading(doc, id)).find(Boolean);
  return heading?.level ?? DEFAULT_LEVEL;
};

/** Right after the last item section of the same table, so tables keep their own sections. */
export const sectionOffset = (doc: Document, table: LedgerTable): number => {
  const ends = table.rows.flatMap((row) => {
    const heading = row.item ? itemHeading(doc, row.item.id) : undefined;
    return heading ? [heading.end] : [];
  });
  return ends.length > 0 ? Math.max(...ends) : doc.text.length;
};

/** The text that puts a new section at `offset` with one blank line on each side. */
export const sectionInsert = (doc: Document, offset: number, section: string): string => {
  const eol = eolOf(doc.text);
  const before = doc.text.slice(0, offset);
  const lead = before.endsWith(`${eol}${eol}`) ? "" : before.endsWith(eol) ? eol : `${eol}${eol}`;
  const trail = offset === doc.text.length ? "" : eol;
  return `${lead}${section}${trail}`;
};

export const addItem = (index: StoreIndex, input: NewItem): Plan => {
  const doc = requireDocument(index, input.document);
  const ledger = doc.ledger?.config;
  if (!ledger) throw new TroveError(`${doc.rel} has no ledger`);

  const statusEnum = ledger.columns.find((column) => column.key === "status")?.enum ?? {};
  const status = labelOf(statusEnum, input.values.status ?? ledger.open[0] ?? "open");
  const table = pickTable(doc, input.values);
  const prefix = idPrefix(ledger, doc, table.section);
  const id = `${prefix}${nextNumber(index, prefix)}`;
  const { section: _, ...cellValues } = input.values;
  const values: Record<string, string> = { ...cellValues, id, status };

  const missing = ledger.columns.filter((column) => column.required && !values[column.key]);
  if (missing.length > 0) {
    throw new TroveError(`missing ${missing.map((column) => column.key).join(", ")}`);
  }
  if (Object.values(values).some((value) => value.includes("|"))) {
    throw new TroveError("a | inside a cell breaks the ledger table");
  }

  const cells = table.keys.map((key) => (key ? (values[key] ?? "") : ""));
  const section = itemSection(ledger, values, sectionLevel(doc), eolOf(doc.text));
  const offset = sectionOffset(doc, table);
  const text = applyPatches(doc.text, [
    appendRow(doc, table, cells),
    insert(offset, sectionInsert(doc, offset, section)),
  ]);
  return {
    changes: [{ rel: doc.rel, text }],
    notes: [`added ${id} to ${doc.rel}`],
    message: `docs: add ${id}`,
  };
};
