export type Line = {
  /** 1-based. */
  number: number;
  text: string;
  /** Offsets into the source text; `end` stops before the line break. */
  start: number;
  end: number;
};

const LINE_BREAK = /\r?\n/g;

export const splitLines = (text: string): Line[] => {
  const lines: Line[] = [];
  let start = 0;
  for (const { index, 0: brk } of text.matchAll(LINE_BREAK)) {
    lines.push({ number: lines.length + 1, text: text.slice(start, index), start, end: index });
    start = index + brk.length;
  }
  lines.push({ number: lines.length + 1, text: text.slice(start), start, end: text.length });
  return lines;
};
