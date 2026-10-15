import type { Line } from "../text/lines.ts";

export type Link = {
  /** Relative target without its `#anchor`. */
  path: string;
  line: number;
  /** Source offsets of `path`, for rewriting it in place. */
  start: number;
  end: number;
  /** Source offset just past the link, where a note after it goes. */
  after: number;
  /** Commit named by a `*(deleted in <sha>)*` note right after the link. */
  deletedIn: string | undefined;
};

const LINK_TARGET = /\]\(([^)\s#]*)(#[^)\s]*)?(?=[)\s])/dg;
const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/|<|$)/i;
const DELETED_NOTE = /^ \*\(deleted in ([\da-f]{7,40})\)\*/;

const CODE_SPAN = /(`+)[^`][\s\S]*?\1/g;

/** Marks a link into code whose file is gone: it is checked at the parent of that commit. */
export const deletedNote = (commit: string): string => ` *(deleted in ${commit})*`;

const inCode = (text: string, at: number): boolean =>
  [...text.matchAll(CODE_SPAN)].some((span) => at > span.index && at < span.index + span[0].length);

const closeOf = (text: string, from: number): number => {
  const close = text.indexOf(")", from);
  return close === -1 ? from : close + 1;
};

/** Relative Markdown link targets outside code; URLs, absolute paths, `<…>` targets and anchors are left out. */
export const findLinks = (lines: readonly Line[], fenced: ReadonlySet<number>): Link[] =>
  lines
    .filter((line) => !fenced.has(line.number))
    .flatMap((line) =>
      [...line.text.matchAll(LINK_TARGET)].flatMap((match): Link[] => {
        const path = match[1] ?? "";
        const at = match.indices?.[1];
        if (EXTERNAL.test(path) || !at || inCode(line.text, match.index)) return [];
        const after = closeOf(line.text, match.index + match[0].length);
        return [
          {
            path,
            line: line.number,
            start: line.start + at[0],
            end: line.start + at[1],
            after: line.start + after,
            deletedIn: DELETED_NOTE.exec(line.text.slice(after))?.[1],
          },
        ];
      }),
    );
