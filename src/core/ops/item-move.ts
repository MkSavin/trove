import { posix } from "node:path";
import type { LedgerConfig } from "../config/schema.ts";
import { labelOf } from "../config/vocabulary.ts";
import { isBlankCell } from "../document/cell.ts";
import { stemOf } from "../document/document.ts";
import { withHeadingNote } from "../edit/heading.ts";
import { appendRow, removeRow } from "../edit/ledger.ts";
import { rebaseText } from "../edit/links.ts";
import { applyPatches, eolOf, insert, replace } from "../edit/patch.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { idToken, itemHeading } from "../index/resolve.ts";
import { archivePlan } from "./doc-archive.ts";
import { type LocatedItem, mentionsOf, requireDocument, requireItem } from "./find.ts";
import { idPrefix, nextNumber } from "./ids.ts";
import { pickTable, sectionInsert, sectionLevel, sectionOffset } from "./item-add.ts";
import { recordClosed } from "./item-close.ts";
import type { Plan } from "./plan.ts";
import { thenPlan } from "./with-changes.ts";

const HEADING_MARKS = /^#+/;

type Renumber = {
  id: string;
  newId: string;
  level: number;
  /** A new heading note; the old one is recognised by the source ledger's vocabulary. */
  status?: { label: string; ledger: LedgerConfig } | undefined;
};

/** The section under its new id, at the heading level the target document uses for items. */
const renumber = (section: string, { id, newId, level, status }: Renumber): string => {
  const [heading = "", ...body] = section.split("\n");
  const renamed = heading
    .replace(idToken(id), (match) => match.replace(id, newId))
    .replace(HEADING_MARKS, "#".repeat(level));
  const noted = status ? withHeadingNote(renamed, status.label, status.ledger) : renamed;
  return [noted, ...body].join("\n");
};

const MOVED = "moved";

/** With a `moved` outcome, the source's companion keeps a row that says where the item went. */
const movedRecord = async (index: StoreIndex, located: LocatedItem, newId: string) => {
  const type = located.doc.typeConfig?.closeInto;
  if (!type || !Object.hasOwn(located.ledger.closed, MOVED)) return undefined;
  const label = labelOf(located.ledger.closed, MOVED);
  const what = `${located.item.values.what ?? ""} → ${newId}`.trim();
  return recordClosed(index, located, type, { label, note: label }, { what });
};

export type MoveOptions = {
  archive?: boolean | undefined;
  section?: string | undefined;
  /** Cells by column key that replace the item's own; a status also becomes the heading note. */
  cells?: Readonly<Record<string, string>> | undefined;
};

/**
 * Moves an item to another ledger: its row and section leave the source, the target gets them
 * under its next id. Columns the target table lacks are dropped and reported.
 */
export const moveItem = async (
  index: StoreIndex,
  id: string,
  targetName: string,
  options: MoveOptions = {},
): Promise<Plan> => {
  const located = requireItem(index, id);
  const { doc: source, row, item } = located;
  const target = requireDocument(index, targetName);
  const ledger = target.ledger?.config;
  if (!ledger) throw new TroveError(`${target.rel} has no ledger`);
  if (target.rel === source.rel) throw new TroveError(`${id} is already in ${target.rel}`);
  const given = options.cells ?? {};
  if (Object.values(given).some((value) => value.includes("|"))) {
    throw new TroveError("a | inside a cell breaks the ledger table");
  }

  const table = pickTable(target, { owner: item.values.owner, section: options.section });
  const prefix = idPrefix(ledger, target, table.section);
  const newId = `${prefix}${nextNumber(index, prefix)}`;
  const values: Readonly<Record<string, string>> = { ...item.values, ...given };
  const cells = table.keys.map((key) => (key === "id" ? newId : key ? (values[key] ?? "") : ""));
  const dropped = Object.keys(values).filter(
    (key) => !table.keys.includes(key) && !isBlankCell(values[key]),
  );

  const heading = itemHeading(source, id);
  const section = heading ? source.text.slice(heading.start, heading.end).trimEnd() : undefined;
  const record = await movedRecord(index, located, newId);
  const sourceText = applyPatches(source.text, [
    removeRow(source, row),
    ...(heading ? [replace({ start: heading.start, end: heading.end }, "")] : []),
    ...(record?.backLink ?? []),
  ]);

  const eol = eolOf(target.text);
  const status = given.status ? { label: given.status, ledger: located.ledger } : undefined;
  const moved = section
    ? rebaseText(
        renumber(section, { id, newId, level: sectionLevel(target), status }),
        posix.dirname(source.rel),
        posix.dirname(target.rel),
      )
    : undefined;
  const offset = sectionOffset(target, table);
  const targetText = applyPatches(target.text, [
    appendRow(target, table, cells),
    ...(moved ? [insert(offset, sectionInsert(target, offset, `${moved}${eol}`))] : []),
  ]);

  const mentions = mentionsOf(index, id, source.rel).filter((rel) => rel !== target.rel);
  const notes = [
    `${id} → ${newId}`,
    ...(dropped.length > 0 ? [`not in the target table, dropped: ${dropped.join(", ")}`] : []),
    ...(mentions.length > 0 ? [`${id} is still mentioned in ${mentions.join(", ")}`] : []),
  ];
  const message = `docs: move ${id} to ${newId}`;
  const changes = [
    { rel: source.rel, text: sourceText },
    { rel: target.rel, text: targetText },
    ...(record ? [record.companion] : []),
  ];
  const plan: Plan = { changes, notes, message };
  if (!options.archive) return plan;

  return {
    ...thenPlan(index, plan, (after) => {
      const emptied = after.byRel.get(source.rel);
      if (!emptied) throw new TroveError(`${source.rel} is gone`);
      return archivePlan(after, emptied);
    }),
    message: `${message}, archive ${stemOf(source)}`,
  };
};
