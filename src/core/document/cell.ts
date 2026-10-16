/** Dashes that stand for no value, as closed rows and reports write them. */
const PLACEHOLDERS = new Set(["", "—", "–", "-"]);

export const isBlankCell = (value: string | undefined): boolean =>
  value === undefined || PLACEHOLDERS.has(value.trim());

/** Values a cell holds: none when blank; each comma-separated part when the column takes several. */
export const cellValues = (raw: string | undefined, multiple: boolean): string[] => {
  if (raw === undefined || isBlankCell(raw)) return [];
  if (!multiple) return [raw];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => !isBlankCell(part));
};
