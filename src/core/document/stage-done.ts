const MARKUP = /[*_`]/g;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;
const LABELLED = /^([^:]+?)\s*:\s*(.*)$/;
const TRAILING_PARENTHESIS = /\s*\(([^()]*)\)[\s.,;]*$/;
const EDGE_PUNCTUATION = /^[\s.,;:—–-]+|[\s.,;:—–-]+$/g;

export const plain = (text: string): string => text.replace(MARKUP, "").trim().toLowerCase();

/** `merged 2026-10-01` and `✓ merged` count as done; `incomplete` and `not done` do not. */
export const isDone = (value: string, done: readonly string[]): boolean => {
  const text = plain(value);
  return done.some((word) => {
    const start = word.toLowerCase();
    return text.startsWith(start) && !WORD_CHARACTER.test(text.charAt(start.length));
  });
};

/** The whole text is a done word, as in `**B1 — merged.**`; `Complete rewrite` is not. */
export const isOnlyDone = (value: string, done: readonly string[]): boolean => {
  const text = plain(value).replace(EDGE_PUNCTUATION, "");
  return text !== "" && done.some((word) => word.toLowerCase() === text);
};

/** `**Status:** merged` or `- state: done` holds a done value under one of the status names. */
export const isDoneStatusLine = (
  text: string,
  status: readonly string[],
  done: readonly string[],
): boolean => {
  const [, label = "", value = ""] = LABELLED.exec(plain(text).replace(LIST_MARKER, "")) ?? [];
  return status.some((name) => name.toLowerCase() === label) && isDone(value, done);
};

/** Cuts a trailing `(merged)`; any other parenthesis stays part of the text. */
export const cutDoneParenthesis = (
  text: string,
  done: readonly string[],
): { text: string; done: boolean } => {
  const match = TRAILING_PARENTHESIS.exec(text);
  return match && isDone(match[1] ?? "", done)
    ? { text: text.slice(0, match.index), done: true }
    : { text, done: false };
};
