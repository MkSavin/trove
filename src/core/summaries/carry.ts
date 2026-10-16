import { writeLabel } from "./write-places.ts";

const ANCHOR = /^(#{1,6} |<!--\s*\/?trove:)/;
const HEADING = /^#{1,6} /;
const BLOCK_OPEN = /^<!--\s*trove:/;
const BLOCK_CLOSE = /^<!--\s*\/trove:/;
const LINE_BREAK = /\r?\n/;
const START = "";
const CLOSED = "/\0";
const EXTRA_BLANKS = /\n{3,}/g;

/** A line outside generated blocks; `anchor` keys the heading or block marker above it. */
type Placed = { line: string; anchor: string; heading: string; isAnchor: boolean };

type Written = { byLabel: Map<string, string[]>; byAnchor: Map<string, string[]> };

/**
 * Anchors are keyed with their occurrence; a closing marker takes its opening line's key, so new
 * blocks of another kind above it do not shift it onto a different block.
 */
const walk = (text: string): Placed[] => {
  const seen = new Map<string, number>();
  const placed: Placed[] = [];
  let anchor = START;
  let heading = START;
  let open: string | undefined;
  const occurrence = (trimmed: string): string => {
    const count = (seen.get(trimmed) ?? 0) + 1;
    seen.set(trimmed, count);
    return `${trimmed}\0${count}`;
  };
  for (const line of text.split(LINE_BREAK)) {
    const trimmed = line.trim();
    const isAnchor = ANCHOR.test(trimmed);
    if (BLOCK_CLOSE.test(trimmed)) {
      anchor = open === undefined ? occurrence(trimmed) : CLOSED + open;
      open = undefined;
    } else if (open !== undefined) continue;
    else if (isAnchor) {
      anchor = occurrence(trimmed);
      if (HEADING.test(trimmed)) heading = anchor;
      if (BLOCK_OPEN.test(trimmed)) open = anchor;
    }
    placed.push({ line, anchor, heading, isAnchor });
  }
  return placed;
};

const writtenIn = (previous: string): Written => {
  const byLabel = new Map<string, string[]>();
  const byAnchor = new Map<string, string[]>([[START, []]]);
  let place: string[] | undefined;
  for (const { line, anchor, isAnchor } of walk(previous)) {
    const label = writeLabel(line);
    if (isAnchor) {
      place = undefined;
      byAnchor.set(anchor, []);
    } else if (label !== undefined) {
      place = [];
      byLabel.set(label, place);
    } else (place ?? byAnchor.get(anchor))?.push(line);
  }
  return { byLabel, byAnchor };
};

const textOf = (lines: readonly string[] | undefined): string | undefined =>
  lines?.join("\n").trim() || undefined;

/**
 * The template with each `<!-- write: … -->` place filled from the previous summary: the text under
 * the same label there, else the text after the same heading or block, else after its heading.
 */
export const carryWritten = (template: string, previous: string): string => {
  const written = writtenIn(previous);
  const used = new Set<string>();
  const take = (key: string, lines: readonly string[] | undefined): string | undefined => {
    if (used.has(key)) return undefined;
    used.add(key);
    return textOf(lines);
  };
  const out: string[] = [];
  for (const { line, anchor, heading } of walk(template)) {
    out.push(line);
    const label = writeLabel(line);
    if (label === undefined) continue;
    const shared = [anchor, heading].find((key) => written.byAnchor.has(key));
    const carried =
      take(`label\0${label}`, written.byLabel.get(label)) ??
      (shared === undefined ? undefined : take(shared, written.byAnchor.get(shared)));
    if (carried !== undefined) out.push(carried);
  }
  return out.join("\n").replace(EXTRA_BLANKS, "\n\n");
};
