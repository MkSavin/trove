/** New content for one file; `text` undefined deletes it, `from` marks a move. */
export type Change = { rel: string; text: string | undefined; from?: string | undefined };

export type Plan = {
  changes: readonly Change[];
  /** Commit message when the store syncs, e.g. `docs: close WEB1-3`. */
  message: string;
  /** Shown to the user after the operation, e.g. other places that mention a closed item. */
  notes: readonly string[];
  /** Rules whose errors in the changed files do not block this operation. */
  tolerate?: readonly string[];
};
