import type { Document } from "../document/document.ts";
import type { Heading } from "../markdown/headings.ts";
import { insert, type Patch, replace } from "./patch.ts";

const TRAILING_NOTE = /\(([^()]*)\)\s*$/d;

/** Sets the `(status)` note at the end of a heading, adding one when there is none. */
export const setHeadingNote = (doc: Document, heading: Heading, note: string): Patch[] => {
  const line = doc.lines[heading.line - 1];
  if (!line) return [];
  const inner = TRAILING_NOTE.exec(line.text)?.indices?.[1];
  return inner
    ? [replace({ start: line.start + inner[0], end: line.start + inner[1] }, note)]
    : [insert(line.end, ` (${note})`)];
};
