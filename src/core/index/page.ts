export type PageRequest = { limit?: number | undefined; offset?: number | undefined };

/** `next` is the offset of the first row left out, when rows remain after this page. */
export type Page<T> = { rows: T[]; total: number; offset: number; next: number | undefined };

export const pageOf = <T>(rows: readonly T[], { limit, offset = 0 }: PageRequest): Page<T> => {
  const end = limit === undefined ? rows.length : Math.min(rows.length, offset + limit);
  return {
    rows: rows.slice(offset, end),
    total: rows.length,
    offset,
    next: end < rows.length ? end : undefined,
  };
};

/** `showing 50 of 621` or `showing 51-100 of 621`; nothing when the page holds every row. */
export const shownText = ({ rows, total, offset }: Page<unknown>): string | undefined => {
  if (rows.length === total) return undefined;
  if (rows.length === 0) return `showing none of ${total}`;
  const range = offset === 0 ? `${rows.length}` : `${offset + 1}-${offset + rows.length}`;
  return `showing ${range} of ${total}`;
};
