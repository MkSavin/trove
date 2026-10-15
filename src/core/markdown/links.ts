import type { Line } from "../text/lines.ts";

export type Link = {
  /** Relative target without its `#anchor`. */
  path: string;
  line: number;
  /** Source offsets of `path`, for rewriting it in place. */
  start: number;
  end: number;
};

const LINK_TARGET = /\]\(([^)\s#]*)(#[^)\s]*)?(?=[)\s])/dg;
const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/|<|$)/i;

const CODE_SPAN = /(`+)[^`][\s\S]*?\1/g;

const inCode = (text: string, at: number): boolean =>
  [...text.matchAll(CODE_SPAN)].some((span) => at > span.index && at < span.index + span[0].length);

/** Relative Markdown link targets outside code; URLs, absolute paths, `<…>` targets and anchors are left out. */
export const findLinks = (lines: readonly Line[], fenced: ReadonlySet<number>): Link[] =>
  lines
    .filter((line) => !fenced.has(line.number))
    .flatMap((line) =>
      [...line.text.matchAll(LINK_TARGET)].flatMap((match) => {
        const path = match[1] ?? "";
        const at = match.indices?.[1];
        if (EXTERNAL.test(path) || !at || inCode(line.text, match.index)) return [];
        return [{ path, line: line.number, start: line.start + at[0], end: line.start + at[1] }];
      }),
    );
