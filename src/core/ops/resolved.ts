import { join, posix } from "node:path";
import { fieldSpecs, hasCapability } from "../config/vocabulary.ts";
import { type Document, parseDocument, stemOf } from "../document/document.ts";
import type { LedgerTable } from "../document/ledger.ts";
import { splitRefs } from "../document/refs.ts";
import { formatRow } from "../edit/ledger.ts";
import { applyPatches, eolOf, insert, type Patch } from "../edit/patch.ts";
import type { StoreIndex } from "../index/index.ts";
import { fillTemplate, type NewDocument, renderNewDocument } from "../templates/new-document.ts";
import { customTemplate, initialStatus, STANDARD } from "./doc-new.ts";

const TITLE = / — (.+)$/;

/** The `resolved-of` document whose `base` names this one. */
export const companionOf = (index: StoreIndex, base: Document): Document | undefined =>
  index.documents.find(
    (doc) =>
      hasCapability(doc.typeConfig, "resolved-of") &&
      splitRefs(doc.meta.base ?? "").includes(base.name),
  );

/** `audits/AUDIT_WEB_1.md` with type `resolved` → `audits/AUDIT_WEB_1.RESOLVED.md`. */
export const companionRel = (base: Document, type: string): string =>
  posix.join(posix.dirname(base.rel), `${stemOf(base)}.${type.toUpperCase()}.md`);

const baseTitle = (base: Document): string => {
  const title = base.headings.find((heading) => heading.level === 1)?.title ?? "";
  return TITLE.exec(title)?.[1] ?? stemOf(base);
};

/** A new companion with the base's values for its required fields; the store's template for its type when there is one. */
export const newCompanion = async (
  index: StoreIndex,
  base: Document,
  type: string,
): Promise<Document> => {
  const rel = companionRel(base, type);
  const specs = fieldSpecs(index.config, index.config.types[type]);
  const inherited = Object.keys(specs).filter(
    (key) => specs[key]?.required && !STANDARD.has(key) && base.meta[key] !== undefined,
  );
  const given: Record<string, string | undefined> = {
    ...Object.fromEntries(inherited.map((key) => [key, base.meta[key]])),
    base: base.name,
    scope: base.meta.scope,
  };
  const document: NewDocument = {
    type,
    name: posix.basename(rel, ".md"),
    title: baseTitle(base),
    status: initialStatus(index, type),
    date: index.today,
    fields: Object.entries(given).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && Object.hasOwn(specs, entry[0]),
    ),
  };
  const template = await customTemplate(index, type);
  const text = template
    ? fillTemplate(template, document, Object.keys(specs))
    : `${renderNewDocument(index.config, document)}\n[${stemOf(base)}](${base.name})\n`;
  return parseDocument({ path: join(index.root, rel), rel, text }, index.config);
};

/** Before the first `##` heading, where a ledger sits in an audit; the end of the file otherwise. */
const ledgerOffset = (doc: Document): number =>
  doc.headings.find((heading) => heading.level === 2)?.start ?? doc.text.length;

const tableLines = (header: readonly string[]): string[] => [
  formatRow(header),
  formatRow(header.map((label) => "-".repeat(Math.max(label.length, 1)))),
];

const newBlock = (index: StoreIndex, doc: Document, table: readonly string[]): Patch => {
  const eol = eolOf(doc.text);
  const marker = doc.ledger?.config.marker ?? "ledger";
  const offset = ledgerOffset(doc);
  const lead = offset === doc.text.length && !doc.text.endsWith(`${eol}${eol}`) ? eol : "";
  const lines = [`## ${index.config.labels.closedLedger}`, "", `<!-- ${marker} -->`, ...table];
  return insert(offset, `${lead}${[...lines, `<!-- /${marker} -->`, "", ""].join(eol)}`);
};

/**
 * The companion with a closed-items table shaped like the base one; under `sectionHeading`
 * when the base splits its ledger into sections.
 */
export const withClosedTable = (
  index: StoreIndex,
  doc: Document,
  base: LedgerTable,
  sectionHeading: string | undefined,
): Document => {
  const fits = (table: LedgerTable) =>
    table.header !== undefined && (!sectionHeading || table.section === base.section);
  if (doc.ledger?.tables.some(fits)) return doc;

  const table = [
    ...(sectionHeading ? [sectionHeading, ""] : []),
    ...tableLines(base.header?.cells ?? []),
  ];
  const close = doc.ledger?.blocks.at(-1)?.close;
  const patch = close
    ? insert(close.start, ["", ...table, ""].join(eolOf(doc.text)))
    : newBlock(index, doc, table);
  const text = applyPatches(doc.text, [patch]);
  return parseDocument({ path: doc.path, rel: doc.rel, text }, index.config);
};
