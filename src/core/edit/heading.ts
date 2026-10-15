import type { LedgerConfig } from "../config/schema.ts";
import type { Document } from "../document/document.ts";
import type { Heading } from "../markdown/headings.ts";
import { type Patch, replace } from "./patch.ts";

const TRAILING_NOTE = /\(([^()]*)\)\s*$/d;
const AFTER_OUTCOME = /^[ ,]/;

const vocabulary = (labels: Readonly<Record<string, string>> | undefined): string[] =>
  Object.entries(labels ?? {}).flat();

/** A note trove wrote: an item status, or a closed note that starts with an outcome. */
const isOwnNote = (note: string, ledger: LedgerConfig): boolean => {
  const statuses = vocabulary(ledger.columns.find((column) => column.key === "status")?.enum);
  const outcomes = vocabulary(ledger.closed);
  return (
    statuses.some((label) => note === label || note.startsWith(`${label},`)) ||
    outcomes.some(
      (label) =>
        note === label || (note.startsWith(label) && AFTER_OUTCOME.test(note.slice(label.length))),
    )
  );
};

/** The heading line with its trove note set; a parenthesis that belongs to the title stays. */
export const withHeadingNote = (text: string, note: string, ledger: LedgerConfig): string => {
  const inner = TRAILING_NOTE.exec(text)?.indices?.[1];
  if (inner && isOwnNote(text.slice(inner[0], inner[1]), ledger)) {
    return `${text.slice(0, inner[0])}${note}${text.slice(inner[1])}`;
  }
  return `${text.trimEnd()} (${note})`;
};

export const setHeadingNote = (
  doc: Document,
  heading: Heading,
  note: string,
  ledger: LedgerConfig,
): Patch[] => {
  const line = doc.lines[heading.line - 1];
  if (!line) return [];
  return [replace({ start: line.start, end: line.end }, withHeadingNote(line.text, note, ledger))];
};
