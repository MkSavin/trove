export type LineRange = { from: number; to: number };

/** `L12`, `L12-L40` (GitHub) or `L12-40` (GitLab). */
const LINE_ANCHOR = /^L(\d+)(?:-L?(\d+))?$/;

export const lineRange = (
  from: string | undefined,
  to: string | undefined,
): LineRange | undefined => {
  if (from === undefined) return undefined;
  const [start, end] = [Number(from), Number(to ?? from)];
  return { from: Math.min(start, end), to: Math.max(start, end) };
};

export const anchorRange = (anchor: string | undefined): LineRange | undefined => {
  const match = anchor === undefined ? null : LINE_ANCHOR.exec(anchor);
  return match ? lineRange(match[1], match[2]) : undefined;
};

/** `40` or `40-55`, as typed on the command line. */
export const parseRange = (text: string): LineRange | undefined => {
  const match = /^(\d+)(?:-(\d+))?$/.exec(text.trim());
  return match ? lineRange(match[1], match[2]) : undefined;
};

export const rangesOverlap = (a: LineRange, b: LineRange): boolean =>
  a.from <= b.to && b.from <= a.to;

export const rangeText = ({ from, to }: LineRange): string =>
  from === to ? String(from) : `${from}-${to}`;
