import type { Document } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { isIsoDate } from "../text/dates.ts";

/** The ledger column and header field that say when something was last checked against the code. */
export const CHECKED = "checked";

const COMMIT = /^[0-9a-f]{7,40}$/;

export const isCommit = (value: string): boolean => COMMIT.test(value);

/** The item's own `checked` cell when it holds a date or a commit, else its document's date. */
export const itemChecked = (doc: Document, item: Item): string | undefined => {
  const own = item.values[CHECKED]?.trim();
  if (own && (isIsoDate(own) || isCommit(own))) return own;
  const shared = doc.meta.checked;
  return shared !== undefined && isIsoDate(shared) ? shared : undefined;
};
