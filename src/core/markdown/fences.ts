import type { Line } from "../text/lines.ts";

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Marks lines inside fenced code blocks, fences included: headings and markers there are text. */
export const fencedLines = (lines: readonly Line[]): ReadonlySet<number> => {
  const fenced = new Set<number>();
  let open: string | undefined;
  for (const line of lines) {
    const fence = FENCE.exec(line.text)?.[1];
    if (open) {
      fenced.add(line.number);
      if (fence && fence[0] === open[0] && fence.length >= open.length) open = undefined;
    } else if (fence) {
      fenced.add(line.number);
      open = fence;
    }
  }
  return fenced;
};
