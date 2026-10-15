import type { Line } from "../text/lines.ts";

export type Block = {
  name: string;
  open: Line;
  /** Missing when the block runs to the end of the file, like the prompt body. */
  close: Line | undefined;
  inner: readonly Line[];
};

const MARKER = /^<!--\s*(\/?)([\w-]+)\s*-->$/;

const marker = (line: Line): { name: string; closing: boolean } | undefined => {
  const match = MARKER.exec(line.text.trim());
  return match ? { name: match[2] ?? "", closing: match[1] === "/" } : undefined;
};

/** Every `<!-- name -->` … `<!-- /name -->` block outside fenced code, in order. */
export const findBlocks = (
  lines: readonly Line[],
  fenced: ReadonlySet<number>,
  name: string,
): Block[] => {
  const visible = lines.filter((line) => !fenced.has(line.number));
  const found: Block[] = [];
  let from = 0;
  while (from < visible.length) {
    const openAt = visible.findIndex(
      (line, i) => i >= from && marker(line)?.name === name && !marker(line)?.closing,
    );
    const open = visible[openAt];
    if (!open) break;
    const closeAt = visible.findIndex(
      (line, i) => i > openAt && marker(line)?.name === name && marker(line)?.closing,
    );
    const close = visible[closeAt];
    found.push({
      name,
      open,
      close,
      inner: lines.slice(open.number, close ? close.number - 1 : lines.length),
    });
    if (!close) break;
    from = closeAt + 1;
  }
  return found;
};

/** The first such block; an unclosed one runs to the end of the file, like the prompt body. */
export const findBlock = (
  lines: readonly Line[],
  fenced: ReadonlySet<number>,
  name: string,
): Block | undefined => findBlocks(lines, fenced, name)[0];
