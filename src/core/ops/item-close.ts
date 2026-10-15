import type { LedgerConfig } from "../config/schema.ts";
import { fieldSpecs, labelOf } from "../config/vocabulary.ts";
import { type Document, stemOf } from "../document/document.ts";
import { setField } from "../edit/front-matter.ts";
import { setHeadingNote, withHeadingNote } from "../edit/heading.ts";
import { appendRow, removeRow } from "../edit/ledger.ts";
import { applyPatches, eolOf, insert, type Patch, replace } from "../edit/patch.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { itemHeading } from "../index/resolve.ts";
import { archivePlan } from "./doc-archive.ts";
import { type LocatedItem, mentionsOf, requireItem } from "./find.ts";
import { sectionInsert, sectionLevel, sectionOffset } from "./item-add.ts";
import type { Change, Plan } from "./plan.ts";
import { companionOf, newCompanion, withClosedTable } from "./resolved.ts";
import { thenPlan } from "./with-changes.ts";

export type CloseOptions = {
  /** Outcome key from `ledger.closed`; the first one when omitted. */
  as?: string | undefined;
  commit?: string | undefined;
  archive?: boolean | undefined;
};

const PLACEHOLDER = /\{(status|date|commit)\}/g;
const HEADING_MARKS = /^#+/;
const LINE_BREAK = /\r?\n/;

/** `{status} {date}, {commit}` filled in; without a commit its part is left out. */
export const closedNote = (
  template: string,
  values: { status: string; date: string; commit: string | undefined },
): string =>
  template
    .split(", ")
    .filter((part) => values.commit !== undefined || !part.includes("{commit}"))
    .join(", ")
    .replace(PLACEHOLDER, (_, key: keyof typeof values) => values[key] ?? "");

const outcomeOf = (ledger: LedgerConfig, as: string | undefined): string => {
  const outcomes = Object.keys(ledger.closed);
  const outcome = as ?? outcomes[0];
  if (outcome === undefined || !Object.hasOwn(ledger.closed, outcome)) {
    throw new TroveError(`no closing outcome ${as}; known: ${outcomes.join(", ")}`);
  }
  return outcome;
};

/** The section with its heading note set, at the level and line breaks of the target. */
const closedSection = (
  section: string,
  note: string,
  ledger: LedgerConfig,
  target: Document,
): string => {
  const [heading = "", ...body] = section.split(LINE_BREAK);
  const marked = withHeadingNote(heading, note, ledger).replace(
    HEADING_MARKS,
    "#".repeat(sectionLevel(target)),
  );
  return [marked, ...body].join(eolOf(target.text));
};

/** Moves the row and the section into the base document's `resolved-of` companion. */
const closeInto = async (
  index: StoreIndex,
  { doc, ledger, table, row, item }: LocatedItem,
  type: string,
  outcome: { label: string; note: string },
): Promise<Change[]> => {
  const heading = itemHeading(doc, item.id);
  const split = (doc.ledger?.tables.filter((candidate) => candidate.header).length ?? 0) > 1;
  const sectionHeading = split
    ? doc.headings.findLast((h) => h.title === table.section && h.line < row.line.number)
    : undefined;
  const sectionLine = sectionHeading ? doc.lines[sectionHeading.line - 1]?.text : undefined;

  const existing = companionOf(index, doc);
  const companion = withClosedTable(
    index,
    existing ?? (await newCompanion(index, doc, type)),
    table,
    sectionLine,
  );
  const target = (companion.ledger?.tables ?? []).findLast(
    (candidate) => candidate.header && (!split || candidate.section === table.section),
  );
  if (!target) throw new TroveError(`${companion.rel} has no table for closed items`);

  const cells = target.keys.map((key) =>
    key === "status" ? outcome.label : key ? (item.values[key] ?? "") : "",
  );
  const section = heading ? doc.text.slice(heading.start, heading.end).trimEnd() : undefined;
  const moved = section
    ? `${closedSection(section, outcome.note, ledger, companion)}${eolOf(companion.text)}`
    : undefined;
  const offset = sectionOffset(companion, target);
  const companionText = applyPatches(companion.text, [
    appendRow(companion, target, cells),
    ...(moved ? [insert(offset, sectionInsert(companion, offset, moved))] : []),
  ]);

  const linksBack =
    Object.hasOwn(fieldSpecs(index.config, doc.typeConfig), type) && doc.meta[type] === undefined;
  const baseText = applyPatches(doc.text, [
    removeRow(doc, row),
    ...(heading ? [replace({ start: heading.start, end: heading.end }, "")] : []),
    ...(linksBack ? [setField(doc, type, companion.name)] : []),
  ]);
  return [
    { rel: doc.rel, text: baseText },
    { rel: companion.rel, text: companionText },
  ];
};

const markInPlace = ({ doc, ledger, row, item }: LocatedItem, note: string): Change[] => {
  const heading = itemHeading(doc, item.id);
  const patches: Patch[] = [
    removeRow(doc, row),
    ...(heading ? setHeadingNote(doc, heading, note, ledger) : []),
  ];
  return [{ rel: doc.rel, text: applyPatches(doc.text, patches) }];
};

/**
 * Drops the ledger row. A type with `closeInto` moves the row and the section into its
 * companion's closed ledger; otherwise the section stays, its heading marked closed.
 */
export const closeItem = async (
  index: StoreIndex,
  id: string,
  options: CloseOptions = {},
): Promise<Plan> => {
  const located = requireItem(index, id);
  const { doc, ledger } = located;
  const label = labelOf(ledger.closed, outcomeOf(ledger, options.as));
  const note = closedNote(ledger.note, {
    status: label,
    date: index.today,
    commit: options.commit,
  });

  const into = doc.typeConfig?.closeInto;
  const changes = into
    ? await closeInto(index, located, into, { label, note })
    : markInPlace(located, note);
  const touched = new Set(changes.map((change) => change.rel));
  const mentions = mentionsOf(index, id, doc.rel).filter((rel) => !touched.has(rel));
  const notes = [
    ...(into ? [`${id} → ${changes[1]?.rel}`] : []),
    ...(mentions.length > 0 ? [`${id} is still mentioned in ${mentions.join(", ")}`] : []),
  ];
  const message = `docs: close ${id}`;
  const plan: Plan = { changes, notes, message };
  if (!options.archive) return plan;

  return {
    ...thenPlan(index, plan, (after) => {
      const closed = after.byRel.get(doc.rel);
      if (!closed) throw new TroveError(`${doc.rel} is gone`);
      return archivePlan(after, closed);
    }),
    message: `${message}, archive ${stemOf(doc)}`,
  };
};
