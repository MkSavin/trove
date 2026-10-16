import type { Document } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import type { StoreIndex } from "../index/index.ts";
import { itemHeading } from "../index/resolve.ts";

const MOVED = "moved";
const TARGET = /→\s*`?([\p{L}\p{N}_-]+)/gu;
const NOTE = /\(([^()]*)\)\s*$/;

/** An item closed as moved, with the new id when its row or heading names it after `→`. */
export type MovedOut = { to: string | undefined };

const lastTarget = (text: string | undefined): string | undefined =>
  [...(text ?? "").matchAll(TARGET)].at(-1)?.[1];

const headingOf = (doc: Document | undefined, id: string): string | undefined =>
  doc && itemHeading(doc, id)?.title;

/** A heading note such as `(moved 2026-10-16)` written when an item is closed in place. */
const notedAsMoved = (doc: Document | undefined, heading: string | undefined): boolean => {
  const label = doc?.ledger?.config.closed[MOVED];
  const note = heading === undefined ? undefined : NOTE.exec(heading)?.[1];
  if (!label || note === undefined || !note.startsWith(label)) return false;
  return note.length === label.length || /^[ ,]/.test(note.slice(label.length));
};

/**
 * Whether an item that was open went away as moved: a closed row with the `moved` outcome, or,
 * once its row is gone, its heading in `rel` marked so.
 */
export const movedOut = (
  index: StoreIndex,
  before: Item,
  after: Item | undefined,
  rel: string,
): MovedOut | undefined => {
  if (after) {
    if (!after.closed || after.status !== MOVED) return undefined;
    const heading = headingOf(index.byRel.get(after.document), after.id);
    return { to: lastTarget(after.values.what) ?? lastTarget(heading) };
  }
  const doc = index.byRel.get(rel);
  const heading = headingOf(doc, before.id);
  return notedAsMoved(doc, heading) ? { to: lastTarget(heading) } : undefined;
};
