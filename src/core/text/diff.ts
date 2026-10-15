export type DiffLine = { kind: "-" | "+"; line: number; text: string };

const MAX_CELLS = 4_000_000;

const splitText = (text: string): string[] => (text === "" ? [] : text.split(/\r?\n/));

/** Changed lines only, numbered in the file they come from; large files fall back to one hunk. */
export const lineDiff = (before: string, after: string): DiffLine[] => {
  const a = splitText(before);
  const b = splitText(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a.at(-1 - tail) === b.at(-1 - tail)) {
    tail++;
  }
  const left = a.slice(head, a.length - tail);
  const right = b.slice(head, b.length - tail);
  if (left.length * right.length > MAX_CELLS) {
    return [
      ...left.map((text, i): DiffLine => ({ kind: "-", line: head + i + 1, text })),
      ...right.map((text, i): DiffLine => ({ kind: "+", line: head + i + 1, text })),
    ];
  }

  const lcs = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] =
        left[i] === right[j]
          ? (lcs[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      i++;
      j++;
    } else if (
      i < left.length &&
      (j === right.length || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))
    ) {
      out.push({ kind: "-", line: head + i + 1, text: left[i] ?? "" });
      i++;
    } else {
      out.push({ kind: "+", line: head + j + 1, text: right[j] ?? "" });
      j++;
    }
  }
  return out;
};
