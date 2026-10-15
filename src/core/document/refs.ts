/** Document names in a `refs` header field: `A.md, B.md`. */
export const splitRefs = (value: string): string[] =>
  value
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);
