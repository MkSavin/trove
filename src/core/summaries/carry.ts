const ANCHOR = /^(#{1,6} |<!--\s*\/?trove:)/;
const BLOCK_OPEN = /^<!--\s*trove:/;
const BLOCK_CLOSE = /^<!--\s*\/trove:/;
const WRITE_PLACE = /^\s*<!--\s*write:/;
const LINE_BREAK = /\r?\n/;
const START = "";
const EXTRA_BLANKS = /\n{3,}/g;

type Gap = { anchor: string; lines: string[] };

/** Text between anchors (headings and generated block markers), each keyed by the anchor above it. */
const gaps = (text: string): Gap[] => {
  const found: Gap[] = [{ anchor: START, lines: [] }];
  let inBlock = false;
  for (const line of text.split(LINE_BREAK)) {
    if (BLOCK_CLOSE.test(line.trim())) inBlock = false;
    else if (inBlock) continue;
    if (ANCHOR.test(line.trim())) {
      found.push({ anchor: line.trim(), lines: [] });
      if (BLOCK_OPEN.test(line.trim())) inBlock = true;
      continue;
    }
    found.at(-1)?.lines.push(line);
  }
  return found;
};

const written = (gap: Gap | undefined): string | undefined => {
  const text = gap?.lines
    .filter((line) => !WRITE_PLACE.test(line))
    .join("\n")
    .trim();
  return text ? text : undefined;
};

/**
 * The template with each `<!-- write: … -->` place filled from the previous summary: the text that
 * sits after the same heading or block there. New blocks and headings of the template stay.
 */
export const carryWritten = (template: string, previous: string): string => {
  const before = new Map(gaps(previous).map((gap) => [gap.anchor, gap]));
  const filled = new Set<string>();
  const out: string[] = [];
  let anchor = START;
  let inBlock = false;
  for (const line of template.split(LINE_BREAK)) {
    const trimmed = line.trim();
    if (BLOCK_CLOSE.test(trimmed)) inBlock = false;
    if (!inBlock && ANCHOR.test(trimmed)) {
      anchor = trimmed;
      if (BLOCK_OPEN.test(trimmed)) inBlock = true;
    }
    const carried = WRITE_PLACE.test(line) ? written(before.get(anchor)) : undefined;
    if (carried === undefined) out.push(line);
    else if (!filled.has(anchor)) {
      out.push(carried);
      filled.add(anchor);
    }
  }
  return out.join("\n").replace(EXTRA_BLANKS, "\n\n");
};
