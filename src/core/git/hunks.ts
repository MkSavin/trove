import type { LineRange } from "../text/line-range.ts";

/** Lines of the old file a hunk replaced; `count` 0 is an insertion after line `start`. */
export type Hunk = { start: number; count: number };

export const WHOLE_FILE: Hunk = { start: 1, count: Number.POSITIVE_INFINITY };
const FILE_HEADER = /^diff --git a\/(.*) b\/\1$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? /;

/**
 * Old-side hunks per file of a `git diff -U0 --no-renames`. A file that did not exist on the old
 * side, or a binary one, counts as changed throughout.
 */
export const parseHunks = (diff: string): Map<string, Hunk[]> => {
  const files = new Map<string, Hunk[]>();
  let hunks: Hunk[] = [];
  let inHeader = false;
  for (const line of diff.split("\n")) {
    const file = FILE_HEADER.exec(line)?.[1];
    if (file !== undefined) {
      hunks = [];
      files.set(file, hunks);
      inHeader = true;
      continue;
    }
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      hunks.push({ start: Number(hunk[1]), count: Number(hunk[2] ?? 1) });
      inHeader = false;
    } else if (inHeader && (line === "--- /dev/null" || line.startsWith("Binary files "))) {
      hunks.push(WHOLE_FILE);
    }
  }
  return files;
};

export const touches = (hunk: Hunk, { from, to }: LineRange): boolean =>
  hunk.count === 0
    ? from <= hunk.start && hunk.start < to
    : hunk.start <= to && hunk.start + hunk.count > from;
