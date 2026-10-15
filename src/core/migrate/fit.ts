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

/** A field every document of a type carries becomes required for that type. */
export const fitRequired = (config: ConfigInput, index: StoreIndex, notes: Notes): ConfigInput => {
  const types = { ...config.types };
  const required = new Map<string, string[]>();
  for (const [name, type] of Object.entries(types)) {
    const docs = index.documents.filter((doc) => doc.type === name && doc.frontMatter);
    if (docs.length === 0 || type.capabilities?.includes("generated")) continue;
    const specs = fieldSpecs(index.config, index.config.types[name]);
    const shared = Object.keys(docs[0]?.meta ?? {}).filter(
      (key) =>
        !specs[key]?.required &&
        config.fields?.[key] !== "required" &&
        docs.every((doc) => doc.meta[key] !== undefined),
    );
    if (shared.length === 0) continue;
    const fields = {
      ...type.fields,
      ...Object.fromEntries(shared.map((key) => [key, "required" as const])),
    };
    types[name] = { ...type, fields };
    for (const key of shared) required.set(key, [...(required.get(key) ?? []), name]);
  }
  for (const [key, names] of required) {
    notes.push(`${key} required for ${names.join(", ")}: every document of these types has it`);
  }
  return { ...config, types };
};

/**
 * Types none of whose documents carry a status line lose the `status-line` capability; when no
 * document has one, every type does, those without documents too.
 */
export const fitStatusLines = (
  config: ConfigInput,
  index: StoreIndex,
  notes: Notes,
): ConfigInput => {
  const types = { ...config.types };
  const nowhere = !index.documents.some((doc) => doc.statusLine);
  for (const [name, type] of Object.entries(types)) {
    const docs = index.documents.filter((doc) => doc.type === name);
    if ((docs.length === 0 && !nowhere) || docs.some((doc) => doc.statusLine)) continue;
    const capabilities = (type.capabilities ?? []).filter((c) => c !== "status-line");
    if (capabilities.length === (type.capabilities ?? []).length) continue;
    types[name] = { ...type, capabilities };
    notes.push(
      docs.length === 0
        ? `type ${name}: no document in the archive has a status line, so none is required`
        : `type ${name}: its documents have no status line, so none is required`,
    );
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

type Vocabulary = Readonly<Record<string, string>>;

const asVocabulary = (values: readonly string[] | Vocabulary | undefined): Vocabulary =>
  Array.isArray(values)
    ? Object.fromEntries(values.map((value) => [value, value]))
    : ((values as Vocabulary | undefined) ?? {});

/** The preset's statuses plus the ones the rows use, so `deferred` stays allowed in an all-open archive. */
const statusVocabulary = (observed: readonly string[], preset: Vocabulary): Vocabulary => ({
  ...preset,
  ...Object.fromEntries(
    observed.filter((value) => keyOf(preset, value) === undefined).map((value) => [value, value]),
  ),
});

/** `P2, P4` seen → `P0` … `P4`: the scale up to the lowest priority used, never only the values seen. */
const priorityScale = (observed: readonly string[]): string[] => {
  const highest = Math.max(...observed.map((value) => Number(value.slice(1))));
  return Array.from({ length: highest + 1 }, (_, i) => `P${i}`);
};

const presetStatuses = (base: LedgerInput | undefined): Vocabulary =>
  asVocabulary(base?.columns.find((column) => column.key === "status")?.enum);

const ledgerFrom = (
  labels: readonly string[],
  docs: readonly Document[],
  marker: string,
  base: LedgerInput | undefined,
  preset: LedgerInput | undefined,
): LedgerInput => {
  const statusEnum = (values: readonly string[]) =>
    statusVocabulary(values, presetStatuses(base ?? preset));
  const columns: ColumnInput[] = labels.map((label, i) => {
    const key = columnKey(label, i);
    const values = statusValues(docs, marker, i);
    const column: ColumnInput = { key, label, required: ["id", "status", "what"].includes(key) };
    if (key === "status") return { ...column, enum: statusEnum(values) };
    if (key === "priority" && values.length > 0 && values.every((v) => PRIORITY.test(v)))
      return { ...column, required: true, enum: priorityScale(values) };
    return column;
  });
  const statusAt = labels.findIndex((label, i) => columnKey(label, i) === "status");
  const statuses = Object.keys(
    statusAt >= 0 ? statusEnum(statusValues(docs, marker, statusAt)) : {},
  );
  const open = statuses.filter((status) => !DEFERRED.test(status));
  return { ...base, columns, open: open.length > 0 ? open : statuses };
};

const vocabularyNote = (owner: string, ledger: LedgerInput): string[] =>
  ledger.columns.flatMap((column) =>
    column.enum
      ? [
          `${owner} ${column.key}: ${Object.keys(asVocabulary(column.enum)).join(", ")}; widen it in the config if more are allowed`,
        ]
      : [],
  );

/** The store ledger from the archive's most common table header; a type whose tables differ gets
 * its own; types whose documents carry ledger blocks get the capability. */
export const fitLedger = (config: ConfigInput, index: StoreIndex, notes: Notes): ConfigInput => {
  const marker = index.config.ledger?.marker ?? "ledger";
  const withBlocks = index.documents.filter((doc) => ledgerHeaders(doc, marker).length > 0);
  const header = headerOf(withBlocks, marker);
  if (!header) return config;

  const preset = config.ledger;
  let ledger = config.ledger;
  if (!fits(header, ledger)) {
    ledger = ledgerFrom(header, withBlocks, marker, ledger, preset);
    notes.push(`ledger columns taken from the archive's tables: ${header.join(" | ")}`);
    notes.push(...vocabularyNote("ledger", ledger));
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
      const typeLedger = ledgerFrom(own, docs, marker, undefined, preset);
      types[name] = { ...type, capabilities, ledger: typeLedger };
      notes.push(`type ${name}: its tables differ, so it gets its own ledger: ${own.join(" | ")}`);
      notes.push(...vocabularyNote(`type ${name}`, typeLedger));
    } else if (capabilities !== type.capabilities) {
      types[name] = { ...type, capabilities };
      notes.push(`type ${name}: its documents carry ledgers, so it gets one`);
    }
  }
  return { ...config, ...(ledger ? { ledger } : {}), types };
};

const TEMPLATE_FIELD = /\{(\w+)\}/g;
const TRAILING_NUMBER = /\d+$/;

const commonPrefix = (values: readonly string[]): string =>
  values.reduce((prefix, value) => {
    let i = 0;
    while (i < prefix.length && prefix[i] === value[i]) i++;
    return prefix.slice(0, i);
  }, values[0] ?? "");

type IdRows = { id: string; section: string | undefined }[];

/** `DEBT-S1` under Server, `DEBT-I1` under Infra → `DEBT-{section}{n}` with `{ Server: S, Infra: I }`. */
const idTemplate = (rows: IdRows): Pick<LedgerInput, "id" | "sections"> | undefined => {
  const stems = rows.map(({ id, section }) => ({ stem: id.replace(TRAILING_NUMBER, ""), section }));
  const distinct = [...new Set(stems.map(({ stem }) => stem))];
  if (stems.length === 0 || stems.some(({ stem }, i) => stem === rows[i]?.id)) return undefined;
  if (distinct.length === 1) return { id: `${distinct[0]}{n}` };

  const prefix = commonPrefix(distinct);
  const sections: Record<string, string> = {};
  for (const { stem, section } of stems) {
    const code = stem.slice(prefix.length);
    if (section === undefined || (sections[section] ?? code) !== code) return undefined;
    sections[section] = code;
  }
  return { id: `${prefix}{section}{n}`, sections };
};

/**
 * A type whose documents lack the header fields its ledger's ids need, as a debt list without a
 * slug, gets an id template read off its ids; ids it cannot read are left for a person.
 */
export const fitIds = (config: ConfigInput, index: StoreIndex, notes: Notes): ConfigInput => {
  const types = { ...config.types };
  for (const [name, type] of Object.entries(types)) {
    if (!type.capabilities?.includes("ledger")) continue;
    const ledger = type.ledger ?? config.ledger;
    if (!ledger) continue;
    const fields = [...(ledger.id ?? "{slug}-{n}").matchAll(TEMPLATE_FIELD)]
      .map((match) => match[1] ?? "")
      .filter((field) => field !== "n" && field !== "section");
    const docs = index.documents.filter((doc) => doc.type === name);
    const lacking = docs.filter((doc) => fields.some((field) => doc.meta[field] === undefined));
    if (lacking.length === 0) continue;

    const rows = lacking.flatMap((doc) => {
      const marker = ledger.marker ?? "ledger";
      const blocks = findBlocks(doc.lines, fencedLines(doc.lines), marker);
      return blocks.flatMap((block) =>
        parseTables(block.inner).flatMap((table) => {
          const section = doc.headings.findLast(
            (h) => h.line < (table.header?.line.number ?? 0),
          )?.title;
          const at = (table.header?.cells ?? []).findIndex(
            (label, i) => columnKey(label, i) === "id",
          );
          return table.rows.map((row) => ({ id: row.cells[at] ?? "", section }));
        }),
      );
    });
    const template = lacking.length === docs.length ? idTemplate(rows) : undefined;
    if (!template) {
      notes.push(
        `type ${name}: ${lacking.map((doc) => doc.rel).join(", ")} lack ${fields.join(", ")} for ids ${ledger.id ?? "{slug}-{n}"}: add them or set the type's ledger.id`,
      );
      continue;
    }
    types[name] = { ...type, ledger: { ...ledger, ...template } };
    notes.push(`type ${name}: ids follow ${template.id}, read off its ledgers`);
  }
  return { ...config, types };
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
