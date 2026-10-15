import type { Config } from "../config/schema.ts";
import type { Span } from "../markdown/tables.ts";
import type { Line } from "../text/lines.ts";

export type StatusLine = {
  line: Line;
  /** Missing when the line exists but does not follow `**Status:** <status>. <note> Checked <date>.` */
  parsed:
    | { status: string; note: string; checked: string; statusSpan: Span; checkedSpan: Span }
    | undefined;
};

const SEARCH_DEPTH = 30;

const pattern = ({ statusLine, checked }: Config["labels"]): RegExp =>
  new RegExp(
    `^\\*\\*${RegExp.escape(statusLine)}:\\*\\* ([^.]+)\\. (.*?)\\s*${RegExp.escape(checked)} (\\d{4}-\\d\\d-\\d\\d)\\.$`,
    "d",
  );

const spanOf = (line: Line, [start, end]: [number, number] = [0, 0]): Span => ({
  start: line.start + start,
  end: line.start + end,
});

export const readStatusLine = (
  body: readonly Line[],
  labels: Config["labels"],
): StatusLine | undefined => {
  const prefix = `**${labels.statusLine}:**`;
  const line = body.slice(0, SEARCH_DEPTH).find((candidate) => candidate.text.startsWith(prefix));
  if (!line) return undefined;

  const match = pattern(labels).exec(line.text);
  if (!match) return { line, parsed: undefined };
  const [, status = "", note = "", checked = ""] = match;
  return {
    line,
    parsed: {
      status,
      note,
      checked,
      statusSpan: spanOf(line, match.indices?.[1]),
      checkedSpan: spanOf(line, match.indices?.[3]),
    },
  };
};
