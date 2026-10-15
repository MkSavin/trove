const GAP = "  ";

const pad = (text: string, width: number): string =>
  text + " ".repeat(Math.max(0, width - Bun.stringWidth(text)));

/** Aligned plain-text columns; the last column is never padded. */
export const formatTable = (rows: readonly (readonly string[])[]): string[] => {
  const widths = rows.reduce<number[]>(
    (acc, row) => row.map((cell, i) => Math.max(acc[i] ?? 0, Bun.stringWidth(cell))),
    [],
  );
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : pad(cell, widths[i] ?? 0)))
      .join(GAP)
      .trimEnd(),
  );
};
