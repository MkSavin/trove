import { eolOf } from "../edit/patch.ts";
import { parseArguments } from "../index/filters.ts";
import { fencedLines } from "../markdown/fences.ts";
import { type Line, splitLines } from "../text/lines.ts";

export type LiveBlock = {
  view: string;
  args: Readonly<Record<string, string>>;
  open: Line;
  /** Missing when the closing marker was never written. */
  close: Line | undefined;
};

const OPEN = /^<!--\s*trove:([\w-]+)(.*?)\s*-->$/;
const CLOSE = /^<!--\s*\/trove:([\w-]+)\s*-->$/;

/** `<!-- trove:<view> key=value… -->` … `<!-- /trove:<view> -->` pairs outside fenced code. */
export const findLiveBlocks = (lines: readonly Line[]): LiveBlock[] => {
  const fenced = fencedLines(lines);
  const visible = lines.filter((line) => !fenced.has(line.number));
  const blocks: LiveBlock[] = [];
  for (let i = 0; i < visible.length; i++) {
    const open = visible[i];
    const match = open ? OPEN.exec(open.text.trim()) : null;
    if (!open || !match) continue;
    const view = match[1] ?? "";
    const closeAt = visible.findIndex(
      (line, j) => j > i && CLOSE.exec(line.text.trim())?.[1] === view,
    );
    blocks.push({ view, args: parseArguments(match[2] ?? ""), open, close: visible[closeAt] });
    if (closeAt > i) i = closeAt;
  }
  return blocks;
};

/** The text with generated block contents left out, so they never count as a mention. */
export const withoutLiveBlocks = (text: string): string => {
  const eol = eolOf(text);
  const blocks = findLiveBlocks(splitLines(text)).filter((block) => block.close);
  return blocks.reduceRight(
    (rest, block) =>
      rest.slice(0, block.open.end) + eol + rest.slice(block.close?.start ?? block.open.end),
    text,
  );
};
