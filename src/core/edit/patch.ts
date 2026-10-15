import { TroveError } from "../errors.ts";
import type { Span } from "../markdown/tables.ts";
import type { Line } from "../text/lines.ts";

/** Replaces `[start, end)` of the source with `text`; an insert has `start === end`. */
export type Patch = Span & { text: string };

export const replace = (span: Span, text: string): Patch => ({ ...span, text });

export const insert = (at: number, text: string): Patch => ({ start: at, end: at, text });

export const eolOf = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n");

/** The line with its line break, or with the break before it when it is the last line. */
export const lineSpan = (lines: readonly Line[], line: Line): Span => {
  const next = lines[line.number];
  if (next) return { start: line.start, end: next.start };
  const previous = lines[line.number - 2];
  return { start: previous ? previous.end : line.start, end: line.end };
};

/** Inserts at equal offsets keep their array order. */
export const applyPatches = (source: string, patches: readonly Patch[]): string => {
  const sorted = patches.toSorted((a, b) => a.start - b.start || a.end - b.end);
  sorted.forEach((patch, i) => {
    const next = sorted[i + 1];
    if (next && next.start < patch.end) throw new TroveError("overlapping edits in one file");
  });
  return sorted.reduceRight(
    (text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end),
    source,
  );
};
