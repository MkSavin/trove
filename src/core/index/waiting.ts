import type { StoreIndex } from "./index.ts";
import { findDocument, sectionsTitled } from "./resolve.ts";

const SEPARATOR = /[,\s]+/;

export const refsOf = (value: string | undefined): string[] =>
  (value ?? "").split(SEPARATOR).filter(Boolean);

/** An item still in a ledger, or a document still in work. */
const isPending = (index: StoreIndex, ref: string): boolean => {
  const item = index.items.find((candidate) => candidate.id === ref);
  if (item) return !item.closed;
  return findDocument(index, ref)?.place === "work";
};

/** Refs of `blocked_by` or `until` that are not done yet. */
export const pendingRefs = (index: StoreIndex, value: string | undefined): string[] =>
  refsOf(value).filter((ref) => isPending(index, ref));

/** Refs that name no item, document or section titled by an id: likely a typo. */
export const unknownRefs = (index: StoreIndex, value: string | undefined): string[] =>
  refsOf(value).filter(
    (ref) =>
      !index.items.some((item) => item.id === ref) &&
      !findDocument(index, ref) &&
      sectionsTitled(index, ref).length === 0,
  );
