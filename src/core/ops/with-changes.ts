import { join } from "node:path";
import { parseDocument } from "../document/document.ts";
import { indexDocuments, type StoreIndex } from "../index/index.ts";
import { compareText } from "../text/compare.ts";
import type { Change, Plan } from "./plan.ts";

/** The index as it would be after the changes. */
export const withChanges = (index: StoreIndex, changes: readonly Change[]): StoreIndex => {
  const gone = new Set(changes.flatMap((change) => [change.from, change.rel]));
  const added = changes.flatMap((change) =>
    change.text === undefined
      ? []
      : [
          parseDocument(
            { path: join(index.root, change.rel), rel: change.rel, text: change.text },
            index.config,
          ),
        ],
  );
  const documents = [...index.documents.filter((doc) => !gone.has(doc.rel)), ...added];
  return {
    ...indexDocuments(
      index.root,
      index.config,
      documents.toSorted((a, b) => compareText(a.rel, b.rel)),
      index.today,
      index.verified,
    ),
    gitData: index.gitData,
  };
};

/** Folds one change into the list: an edit or move of a file the list already changes replaces that change. */
const fold = (changes: readonly Change[], next: Change): Change[] => {
  const at = changes.findIndex((change) => change.rel === (next.from ?? next.rel));
  if (at < 0) return [...changes, next];
  const previous = changes[at];
  const merged = { ...next, from: previous?.from ?? next.from };
  return changes.with(at, merged);
};

/** The first plan, then a plan built on the index the first one leaves. */
export const thenPlan = (
  index: StoreIndex,
  first: Plan,
  next: (after: StoreIndex) => Plan,
): Plan => {
  const second = next(withChanges(index, first.changes));
  return {
    ...first,
    changes: second.changes.reduce(fold, [...first.changes]),
    notes: [...first.notes, ...second.notes],
    tolerate: [...(first.tolerate ?? []), ...(second.tolerate ?? [])],
  };
};
