import type { Line } from "../text/lines.ts";

export type Span = { start: number; end: number };

export type TableRow = {
  cells: readonly string[];
  /** Source offsets of each trimmed cell, for in-place edits. */
  spans: readonly Span[];
  line: Line;
};

export type Table = {
  /** Missing when the first row is not followed by a `| --- |` separator. */
  header: TableRow | undefined;
  rows: readonly TableRow[];
};

const SEPARATOR = /^[\s|:-]*$/;

const isRow = (line: Line): boolean => line.text.startsWith("|");
const isSeparator = (line: Line): boolean => SEPARATOR.test(line.text) && line.text.includes("-");

const trimmed = (text: string, from: number, to: number, base: number): Span => {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(text[start] ?? "")) start++;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end--;
  return { start: base + start, end: base + end };
};

/** Splits on every `|`: an escaped pipe is still a broken cell for downstream importers. */
export const cellSpans = (line: Line): Span[] => {
  const { text } = line;
  const pipes = [...text.matchAll(/\|/g)].map((match) => match.index);
  const first = text.trimStart().startsWith("|") ? (pipes.shift() ?? -1) : -1;
  const last = text.trimEnd().endsWith("|") ? (pipes.pop() ?? text.length) : text.length;
  const bounds = [first, ...pipes, last];
  return bounds.slice(1).map((end, i) => trimmed(text, (bounds[i] ?? 0) + 1, end, line.start));
};

export const toRow = (line: Line): TableRow => {
  const spans = cellSpans(line);
  const cells = spans.map(({ start, end }) =>
    line.text.slice(start - line.start, end - line.start),
  );
  return { cells, spans, line };
};

const toTable = (run: readonly Line[]): Table => {
  const [first, second] = run;
  const hasHeader = first !== undefined && second !== undefined && isSeparator(second);
  const body = (hasHeader ? run.slice(2) : run).filter((line) => !isSeparator(line));
  return { header: hasHeader ? toRow(first) : undefined, rows: body.map(toRow) };
};

export const parseTables = (lines: readonly Line[]): Table[] => {
  const runs: Line[][] = [];
  let run: Line[] = [];
  for (const line of lines) {
    if (isRow(line)) {
      run.push(line);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs.map(toTable);
};
