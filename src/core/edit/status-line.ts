import type { Document } from "../document/document.ts";
import { type Patch, replace } from "./patch.ts";

/** Edits only the status word and the date; a missing or malformed line is left to `check`. */
export const setStatusLine = (
  doc: Document,
  change: { status?: string | undefined; checked?: string | undefined },
): Patch[] => {
  const parsed = doc.statusLine?.parsed;
  if (!parsed) return [];
  return [
    ...(change.status === undefined ? [] : [replace(parsed.statusSpan, change.status)]),
    ...(change.checked === undefined ? [] : [replace(parsed.checkedSpan, change.checked)]),
  ];
};
