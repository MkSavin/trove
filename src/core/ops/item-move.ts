import { labelOf } from "../config/vocabulary.ts";
import { stemOf } from "../document/document.ts";
import { appendRow, removeRow } from "../edit/ledger.ts";
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

/** The section under its new id, at the heading level the target document uses for items. */
const renumber = (section: string, id: string, newId: string, level: number): string => {
  const [heading = "", ...body] = section.split("\n");
  const renamed = heading
    .replace(idToken(id), (match) => match.replace(id, newId))
    .replace(HEADING_MARKS, "#".repeat(level));
  return [renamed, ...body].join("\n");
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

/**
 * Moves an item to another ledger: its row and section leave the source, the target gets them
 * under its next id. Columns the target table lacks are dropped and reported.
 */
export const moveItem = async (
  index: StoreIndex,
  id: string,
  targetName: string,
  options: { archive?: boolean | undefined; section?: string | undefined } = {},
): Promise<Plan> => {
  const located = requireItem(index, id);
  const { doc: source, row, item } = located;
  const target = requireDocument(index, targetName);
  const ledger = target.ledger?.config;
  if (!ledger) throw new TroveError(`${target.rel} has no ledger`);
  if (target.rel === source.rel) throw new TroveError(`${id} is already in ${target.rel}`);

  const table = pickTable(target, { owner: item.values.owner, section: options.section });
  const prefix = idPrefix(ledger, target, table.section);
  const newId = `${prefix}${nextNumber(index, prefix)}`;
  const cells = table.keys.map((key) =>
    key === "id" ? newId : key ? (item.values[key] ?? "") : "",
  );
  const dropped = Object.keys(item.values).filter((key) => !table.keys.includes(key));

  const heading = itemHeading(source, id);
  const section = heading ? source.text.slice(heading.start, heading.end).trimEnd() : undefined;
  const record = await movedRecord(index, located, newId);
  const sourceText = applyPatches(source.text, [
    removeRow(source, row),
    ...(heading ? [replace({ start: heading.start, end: heading.end }, "")] : []),
    ...(record?.backLink ?? []),
  ]);

  const eol = eolOf(target.text);
  const moved = section ? renumber(section, id, newId, sectionLevel(target)) : undefined;
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
