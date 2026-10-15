import type { LedgerConfig } from "../config/schema.ts";
import type { Document } from "../document/document.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";

const FIELD = /\{(\w+)\}/g;
const NUMBER = "{n}";
const SECTION = "section";

/** The id code of a ledger table's section: `sections: { Server: S }` gives `S` under `## Server`. */
export const sectionCode = (ledger: LedgerConfig, section: string | undefined): string => {
  const code = section === undefined ? undefined : ledger.sections?.[section];
  if (code === undefined) {
    const known = Object.keys(ledger.sections ?? {}).join(", ");
    throw new TroveError(`no id code for section ${section ?? "(none)"}; known: ${known}`);
  }
  return code;
};

/** `{slug}-{n}` with `slug: WEB1` gives `WEB1-`; the number must close the template. */
export const idPrefix = (ledger: LedgerConfig, doc: Document, section?: string): string => {
  if (!ledger.id.endsWith(NUMBER)) throw new TroveError(`ledger.id must end with ${NUMBER}`);
  return ledger.id.slice(0, -NUMBER.length).replace(FIELD, (_, field: string) => {
    if (field === SECTION) return sectionCode(ledger, section);
    const value = doc.meta[field];
    if (value === undefined) throw new TroveError(`${doc.rel} has no ${field} for item ids`);
    return value;
  });
};

/** Scans every document, archive included, so a closed item's number is never reused. */
export const nextNumber = (index: StoreIndex, prefix: string): number => {
  const pattern = new RegExp(`(?:^|[^\\w-])${RegExp.escape(prefix)}(\\d+)(?![\\w-])`, "g");
  const used = index.documents.flatMap((doc) =>
    [...doc.text.matchAll(pattern)].map((match) => Number(match[1])),
  );
  return Math.max(0, ...used) + 1;
};
