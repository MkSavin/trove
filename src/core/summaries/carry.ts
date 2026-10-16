import { writeLabel } from "./write-places.ts";

const ANCHOR = /^(#{1,6} |<!--\s*\/?trove:)/;
const HEADING = /^#{1,6} /;
const BLOCK_OPEN = /^<!--\s*trove:([\w-]+)/;
const BLOCK_CLOSE = /^<!--\s*\/trove:/;
const LINE_BREAK = /\r?\n/;
const START = "";
const CLOSED = "/\0";
const EXTRA_BLANKS = /\n{3,}/g;

/** A line outside generated blocks; `anchor` keys the heading or block marker above it. */
type Placed = { line: string; anchor: string; heading: string; isAnchor: boolean };

type Written = {
  byLabel: Map<string, string[]>;
  byAnchor: Map<string, string[]>;
  bySection: Map<string, string[]>;
};

const counter = () => {
  const seen = new Map<string, number>();
  return (key: string): string => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return `${key}\0${count}`;
  };
};

/**
 * A heading is keyed by its text; a block by its kind and how many of that kind came before it
 * under the same heading, so changed options or blocks added elsewhere do not lose its text.
 */
const walk = (text: string): Placed[] => {
  const headings = counter();
  let blocks = counter();
  const placed: Placed[] = [];
  let anchor = START;
  let heading = START;
  let open: string | undefined;
  for (const line of text.split(LINE_BREAK)) {
    const trimmed = line.trim();
    const isAnchor = ANCHOR.test(trimmed);
    const kind = BLOCK_OPEN.exec(trimmed)?.[1];
    if (BLOCK_CLOSE.test(trimmed)) {
      anchor = open === undefined ? blocks(`${heading}\0${trimmed}`) : CLOSED + open;
      open = undefined;
    } else if (open !== undefined) continue;
    else if (HEADING.test(trimmed)) {
      heading = anchor = headings(trimmed);
      blocks = counter();
    } else if (kind !== undefined) open = anchor = blocks(`${heading}\0${kind}`);
    placed.push({ line, anchor, heading, isAnchor });
  }
  return placed;
};

const writtenIn = (previous: string): Written => {
  const byLabel = new Map<string, string[]>();
  const byAnchor = new Map<string, string[]>([[START, []]]);
  const bySection = new Map<string, string[]>();
  let place: string[] | undefined;
  for (const { line, anchor, heading, isAnchor } of walk(previous)) {
    const label = writeLabel(line);
    if (isAnchor) {
      place = undefined;
      byAnchor.set(anchor, []);
      bySection.set(heading, [...(bySection.get(heading) ?? []), anchor]);
    } else if (label !== undefined) {
      place = [];
      byLabel.set(label, place);
    } else (place ?? byAnchor.get(anchor))?.push(line);
  }
  return { byLabel, byAnchor, bySection };
};

const textOf = (lines: readonly string[] | undefined): string | undefined =>
  lines?.join("\n").trim() || undefined;

/** How many write places of the template still wait for the text after each anchor. */
const claimsOf = (placed: readonly Placed[]): Map<string, number> => {
  const claims = new Map<string, number>();
  for (const { line, anchor } of placed)
    if (writeLabel(line) !== undefined) claims.set(anchor, (claims.get(anchor) ?? 0) + 1);
  return claims;
};

/**
 * The template with each `<!-- write: … -->` place filled from the previous summary: the text under
 * the same label there, else after the same heading or block, else the nearest text of its section
 * that no other write place of the template waits for.
 */
export const carryWritten = (template: string, previous: string): string => {
  const written = writtenIn(previous);
  const placed = walk(template);
  const claims = claimsOf(placed);
  const used = new Set<string>();
  const take = (key: string, lines: readonly string[] | undefined): string | undefined => {
    if (used.has(key)) return undefined;
    used.add(key);
    return textOf(lines);
  };
  const isFree = (key: string): boolean =>
    !used.has(key) && !claims.get(key) && textOf(written.byAnchor.get(key)) !== undefined;
  const fallback = (heading: string, above: readonly string[]): string | undefined => {
    const nearestFirst = [...above].reverse().concat(written.bySection.get(heading) ?? []);
    const key = nearestFirst.find(isFree);
    return key === undefined ? undefined : take(key, written.byAnchor.get(key));
  };
  const out: string[] = [];
  let section: string | undefined;
  let above: string[] = [];
  for (const { line, anchor, heading, isAnchor } of placed) {
    if (heading !== section) {
      section = heading;
      above = [];
    }
    if (isAnchor) above.push(anchor);
    out.push(line);
    const label = writeLabel(line);
    if (label === undefined) continue;
    claims.set(anchor, (claims.get(anchor) ?? 1) - 1);
    const carried =
      take(`label\0${label}`, written.byLabel.get(label)) ??
      (written.byAnchor.has(anchor)
        ? take(anchor, written.byAnchor.get(anchor))
        : fallback(heading, above));
    if (carried !== undefined) out.push(carried);
  }
  return out.join("\n").replace(EXTRA_BLANKS, "\n\n");
};
