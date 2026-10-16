const WRITE_PLACE = /^\s*<!--\s*write:\s*(.*?)\s*(?:-->)?\s*$/;
const SECTION_BREAK = /^(#{1,6} |<!--\s*\/?trove:|<!--\s*write:)/;

/** The label of a `<!-- write: … -->` line, which stays above the text written for it. */
export const writeLabel = (line: string): string | undefined => WRITE_PLACE.exec(line)?.[1];

export const isWritePlace = (line: string): boolean => writeLabel(line) !== undefined;

/** Indexes of write places with nothing written under them before the next heading, block or place. */
export const emptyWritePlaces = (lines: readonly string[]): number[] =>
  lines.flatMap((line, i) => {
    if (!isWritePlace(line)) return [];
    const next = lines.slice(i + 1).find((after) => after.trim() !== "");
    return next === undefined || SECTION_BREAK.test(next.trim()) ? [i] : [];
  });
