import type { Line } from "../text/lines.ts";

export type Heading = {
  level: number;
  title: string;
  line: number;
  /** The section spans from the heading to the next heading of the same or higher level. */
  start: number;
  end: number;
};

const ATX = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

export const parseHeadings = (
  lines: readonly Line[],
  fenced: ReadonlySet<number>,
  textLength: number,
): Heading[] => {
  const headings: Heading[] = lines.flatMap((line) => {
    const match = fenced.has(line.number) ? null : ATX.exec(line.text);
    if (!match) return [];
    const [, hashes = "", title = ""] = match;
    return [{ level: hashes.length, title, line: line.number, start: line.start, end: textLength }];
  });

  headings.forEach((heading, i) => {
    const next = headings.slice(i + 1).find((other) => other.level <= heading.level);
    if (next) heading.end = next.start;
  });
  return headings;
};
