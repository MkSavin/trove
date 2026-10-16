export type DiffLine = { kind: "-" | "+"; line: number; text: string };

/** Bounds the edit-script search: a diff past it is shown as one hunk. */
const MAX_TRACE = 16_000_000;

const splitText = (text: string): string[] => (text === "" ? [] : text.split(/\r?\n/));

/** Shortest edit script (Myers): cost grows with the number of changes, not the file size. */
const editScript = (a: readonly string[], b: readonly string[]): DiffLine[] | undefined => {
  const max = a.length + b.length;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    if ((d + 1) * v.length > MAX_TRACE) return undefined;
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < a.length && y < b.length && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= a.length && y >= b.length) return backtrack(trace, a, b, offset);
    }
  }
  return undefined;
};

const backtrack = (
  trace: readonly Int32Array[],
  a: readonly string[],
  b: readonly string[],
  offset: number,
): DiffLine[] => {
  const out: DiffLine[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d] as Int32Array;
    const k = x - y;
    const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
    const previousK = down ? k + 1 : k - 1;
    const previousX = v[offset + previousK] ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x--;
      y--;
    }
    if (down) out.push({ kind: "+", line: y, text: b[y - 1] ?? "" });
    else out.push({ kind: "-", line: x, text: a[x - 1] ?? "" });
    x = previousX;
    y = previousY;
  }
  return out.reverse();
};

/** Changed lines only, numbered in the file they come from; an unbounded diff falls back to one hunk. */
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
  const script = editScript(left, right);
  if (!script) {
    return [
      ...left.map((text, i): DiffLine => ({ kind: "-", line: head + i + 1, text })),
      ...right.map((text, i): DiffLine => ({ kind: "+", line: head + i + 1, text })),
    ];
  }
  return script.map((line) => ({ ...line, line: head + line.line }));
};
