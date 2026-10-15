import { parseDocument, stemOf } from "../document/document.ts";
import { setHeadingNote } from "../edit/heading.ts";
import { removeRow } from "../edit/ledger.ts";
import { applyPatches } from "../edit/patch.ts";
import type { StoreIndex } from "../index/index.ts";
import { itemHeading } from "../index/resolve.ts";
import { archivePlan } from "./doc-archive.ts";
import { mentionsOf, requireItem } from "./find.ts";
import type { Plan } from "./plan.ts";

export type CloseOptions = { commit?: string | undefined; archive?: boolean | undefined };

const PLACEHOLDER = /\{(date|commit)\}/;

/** `closed {date}, {commit}` filled in; without a commit its part is left out. */
export const closedNote = (template: string, date: string, commit: string | undefined): string => {
  if (!PLACEHOLDER.test(template)) return [template, commit].filter(Boolean).join(", ");
  return template
    .split(", ")
    .filter((part) => commit !== undefined || !part.includes("{commit}"))
    .join(", ")
    .replaceAll("{date}", date)
    .replaceAll("{commit}", commit ?? "");
};

/** Drops the ledger row and marks the item's own section closed; the section text stays. */
export const closeItem = (index: StoreIndex, id: string, options: CloseOptions = {}): Plan => {
  const { doc, row } = requireItem(index, id);
  const heading = itemHeading(doc, id);
  const note = closedNote(doc.ledger?.config.closed ?? "closed", index.today, options.commit);
  const text = applyPatches(doc.text, [
    removeRow(doc, row),
    ...(heading ? setHeadingNote(doc, heading, note) : []),
  ]);

  const mentions = mentionsOf(index, id, doc.rel);
  const notes = mentions.length > 0 ? [`${id} is still mentioned in ${mentions.join(", ")}`] : [];
  const message = `docs: close ${id}`;
  if (!options.archive) return { changes: [{ rel: doc.rel, text }], notes, message };

  const closed = parseDocument({ path: doc.path, rel: doc.rel, text }, index.config);
  return { ...archivePlan(index, closed), notes, message: `${message}, archive ${stemOf(doc)}` };
};
