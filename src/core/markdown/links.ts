import type { Line } from "../text/lines.ts";

export type Link = {
  /** Relative target without its `#anchor`. */
  path: string;
  /** The `#…` part without the `#`, e.g. `L12-L40`. */
  anchor: string | undefined;
  line: number;
  /** Source offsets of `path`, for rewriting it in place. */
  start: number;
  end: number;
  /** Source offset just past the link, where a note after it goes. */
  after: number;
  /** A `*(deleted in <sha>)*` or `*(at <sha>)*` note right after the link. */
  pin: Pin | undefined;
};

/** A commit where a linked file can still be read: `deleted in` reads its parent, `at` the commit. */
export type Pin = { note: "deleted in" | "at"; commit: string };

const LINK_TARGET = /\]\(([^)\s#]*)(#[^)\s]*)?(?=[)\s])/dg;
const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/|<|$)/i;
const PIN_NOTE = /^ \*\((deleted in|at) ([\da-f]{7,40})\)\*/;

const CODE_SPAN = /(`+)[^`][\s\S]*?\1/g;

export const pinNote = ({ note, commit }: Pin): string => ` *(${note} ${commit})*`;

/** The commit a pinned link is checked at. */
export const pinnedRef = ({ note, commit }: Pin): string => (note === "at" ? commit : `${commit}^`);

const pinAfter = (rest: string): Pin | undefined => {
  const match = PIN_NOTE.exec(rest);
  return match?.[2]
    ? { note: match[1] === "at" ? "at" : "deleted in", commit: match[2] }
    : undefined;
};

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
            anchor: match[2]?.slice(1),
            line: line.number,
            start: line.start + at[0],
            end: line.start + at[1],
            after: line.start + after,
            pin: pinAfter(line.text.slice(after)),
          },
        ];
      }),
    );
