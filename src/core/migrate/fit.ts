import type { ConfigInput } from "../config/schema.ts";
import { fieldSpecs, keyOf } from "../config/vocabulary.ts";
import type { Document } from "../document/document.ts";
import type { StoreIndex } from "../index/index.ts";
import { findBlocks } from "../markdown/blocks.ts";
import { fencedLines } from "../markdown/fences.ts";
import { parseTables } from "../markdown/tables.ts";

type Notes = string[];
type ColumnInput = NonNullable<ConfigInput["ledger"]>["columns"][number];

const COLUMN_KEYS: Readonly<Record<string, string>> = {
  id: "id",
  p: "priority",
  priority: "priority",
  приоритет: "priority",
  status: "status",
  статус: "status",
  owner: "owner",
  владелец: "owner",
  module: "module",
  модуль: "module",
  what: "what",
  left: "what",
  "what is left": "what",
  "что осталось": "what",
  todo: "what",
};
const DEFERRED = /defer|отлож/i;
const PRIORITY = /^P\d$/;

const count = <T>(values: readonly T[]): Map<T, number> =>
  values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map());

const mostCommon = <T>(values: readonly T[]): T | undefined =>
  [...count(values)].toSorted(([, a], [, b]) => b - a)[0]?.[0];

/** Header fields a document's type does not declare become optional store-wide fields. */
export const fitFields = (config: ConfigInput, index: StoreIndex, notes: Notes): ConfigInput => {
  const fields = { ...config.fields };
  for (const doc of index.documents) {
    const known = fieldSpecs(index.config, doc.typeConfig);
    for (const key of Object.keys(doc.meta)) {
      if (Object.hasOwn(known, key) || fields[key]) continue;
      fields[key] = "optional";
      notes.push(`header field ${key} is not in the preset: added as optional`);
    }
  }
  return { ...config, fields };
};

/** Types none of whose documents carry a status line lose the `status-line` capability. */
export const fitStatusLines = (
  config: ConfigInput,
  index: StoreIndex,
  notes: Notes,
): ConfigInput => {
  const types = { ...config.types };
  for (const [name, type] of Object.entries(types)) {
    const docs = index.documents.filter((doc) => doc.type === name);
    if (docs.length === 0 || docs.some((doc) => doc.statusLine)) continue;
    const capabilities = (type.capabilities ?? []).filter((c) => c !== "status-line");
    if (capabilities.length === (type.capabilities ?? []).length) continue;
    types[name] = { ...type, capabilities };
    notes.push(`type ${name}: its documents have no status line, so none is required`);
  }
  return { ...config, types };
};

/** When the documents use status keys rather than the preset's labels, labels become the keys. */
export const fitStatusLabels = (
  config: ConfigInput,
  index: StoreIndex,
  notes: Notes,
): ConfigInput => {
  const statuses = config.statuses ?? {};
  const used = index.documents.map((doc) => doc.meta.status).filter((s) => s !== undefined);
  const byKey = used.filter((s) => Object.hasOwn(statuses, s) && statuses[s] !== s).length;
  const byLabel = used.filter((s) => !Object.hasOwn(statuses, s)).length;
  if (byKey <= byLabel) return config;
  notes.push("documents write status keys, not labels: labels set to the keys");
  return {
    ...config,
    statuses: Object.fromEntries(Object.keys(statuses).map((key) => [key, key])),
  };
};

/** Statuses the archive's documents keep besides the archive status, e.g. `done` or `closed`. */
export const fitFinished = (config: ConfigInput, index: StoreIndex, notes: Notes): ConfigInput => {
  const archiveStatus = index.config.archive.status;
  const finished = [
    ...new Set(
      index.documents
        .filter((doc) => doc.place === "archive" && doc.meta.status !== undefined)
        .map((doc) => keyOf(config.statuses ?? {}, doc.meta.status ?? "") ?? "")
        .filter((status) => status && status !== archiveStatus),
    ),
  ].sort();
  if (finished.length === 0) return config;
  notes.push(`the archive also holds ${finished.join(", ")}: allowed there`);
  return { ...config, archive: { ...index.config.archive, ...config.archive, finished } };
};

const ledgerHeaders = (doc: Document, marker: string): (readonly string[])[] => {
  const blocks = findBlocks(doc.lines, fencedLines(doc.lines), marker);
  return blocks.flatMap((block) => parseTables(block.inner).map((t) => t.header?.cells ?? []));
};

const columnKey = (label: string, i: number): string =>
  COLUMN_KEYS[label.toLowerCase()] ??
  (/^[a-z][\w-]*$/i.test(label) ? label.toLowerCase() : `column${i + 1}`);

const statusValues = (docs: readonly Document[], marker: string, at: number): string[] =>
  [
    ...new Set(
      docs.flatMap((doc) =>
        findBlocks(doc.lines, fencedLines(doc.lines), marker).flatMap((block) =>
          parseTables(block.inner).flatMap((table) => table.rows.map((row) => row.cells[at] ?? "")),
        ),
      ),
    ),
  ]
    .filter(Boolean)
    .sort();

type LedgerInput = NonNullable<ConfigInput["ledger"]>;

const headerOf = (docs: readonly Document[], marker: string): string[] | undefined =>
  mostCommon(docs.flatMap((doc) => ledgerHeaders(doc, marker)).map((h) => h.join("|")))?.split("|");

const fits = (labels: readonly string[], ledger: LedgerInput | undefined): boolean =>
  ledger !== undefined &&
  labels.every((label) => ledger.columns.some((column) => column.label === label));

const ledgerFrom = (
  labels: readonly string[],
  docs: readonly Document[],
  marker: string,
  base: LedgerInput | undefined,
): LedgerInput => {
  const columns: ColumnInput[] = labels.map((label, i) => {
    const key = columnKey(label, i);
    const values = statusValues(docs, marker, i);
    const column: ColumnInput = { key, label, required: ["id", "status", "what"].includes(key) };
    if (key === "status") return { ...column, enum: values };
    if (key === "priority" && values.length > 0 && values.every((v) => PRIORITY.test(v)))
      return { ...column, required: true, enum: values };
    return column;
  });
  const statusAt = labels.findIndex((label, i) => columnKey(label, i) === "status");
  const statuses = statusAt >= 0 ? statusValues(docs, marker, statusAt) : [];
  const open = statuses.filter((status) => !DEFERRED.test(status));
  return { ...base, columns, open: open.length > 0 ? open : statuses };
};

/** The store ledger from the archive's most common table header; a type whose tables differ gets
 * its own; types whose documents carry ledger blocks get the capability. */
export const fitLedger = (config: ConfigInput, index: StoreIndex, notes: Notes): ConfigInput => {
  const marker = index.config.ledger?.marker ?? "ledger";
  const withBlocks = index.documents.filter((doc) => ledgerHeaders(doc, marker).length > 0);
  const header = headerOf(withBlocks, marker);
  if (!header) return config;

  let ledger = config.ledger;
  if (!fits(header, ledger)) {
    ledger = ledgerFrom(header, withBlocks, marker, ledger);
    notes.push(`ledger columns taken from the archive's tables: ${header.join(" | ")}`);
  }

  const types = { ...config.types };
  for (const name of new Set(withBlocks.map((doc) => doc.type))) {
    const type = name === undefined ? undefined : types[name];
    if (!name || !type) continue;
    const docs = withBlocks.filter((doc) => doc.type === name);
    const own = headerOf(docs, marker) ?? [];
    const capabilities = type.capabilities?.includes("ledger")
      ? type.capabilities
      : ["ledger" as const, ...(type.capabilities ?? [])];
    if (!fits(own, type.ledger ?? ledger)) {
      types[name] = { ...type, capabilities, ledger: ledgerFrom(own, docs, marker, undefined) };
      notes.push(`type ${name}: its tables differ, so it gets its own ledger: ${own.join(" | ")}`);
    } else if (capabilities !== type.capabilities) {
      types[name] = { ...type, capabilities };
      notes.push(`type ${name}: its documents carry ledgers, so it gets one`);
    }
  }
  return { ...config, ...(ledger ? { ledger } : {}), types };
};

/** Reports that would come out empty and that the archive never had are left out. */
export const fitReports = (config: ConfigInput, index: StoreIndex, notes: Notes): ConfigInput => {
  const reports = Object.fromEntries(
    Object.entries(config.reports ?? {}).filter(([name, report]) => {
      const types = report.sections.flatMap((section) => [section.where?.type ?? []].flat());
      const keep =
        types.length === 0 || index.documents.some((doc) => types.includes(doc.type ?? ""));
      if (!keep) notes.push(`report ${name}: no ${types.join(", ")} documents, left out`);
      return keep;
    }),
  );
  return { ...config, reports };
};
