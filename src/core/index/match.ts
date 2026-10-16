import { keyOf } from "../config/vocabulary.ts";

type Vocabulary = Readonly<Record<string, string>> | undefined;

const NOT = "!";
const CONTAINS = "~";
const GLOB = /[*?[{]/;

/** One wanted value: exact (raw or vocabulary key), `~text` substring, or a glob. */
const matchesOne = (raw: string, vocabulary: Vocabulary, pattern: string): boolean => {
  if (pattern.startsWith(CONTAINS)) {
    return raw.toLowerCase().includes(pattern.slice(CONTAINS.length).toLowerCase());
  }
  if (GLOB.test(pattern)) return new Bun.Glob(pattern).match(raw);
  return raw === pattern || (vocabulary !== undefined && keyOf(vocabulary, raw) === pattern);
};

/**
 * A field passes when one of its values matches a plain pattern (if any) and none matches a `!`
 * one. A missing field has no values, so only negations accept it.
 */
export const fieldMatches = (
  values: readonly string[],
  vocabulary: Vocabulary,
  wanted: readonly string[],
): boolean => {
  const excluded = wanted.filter((value) => value.startsWith(NOT)).map((value) => value.slice(1));
  const included = wanted.filter((value) => !value.startsWith(NOT));
  const hits = (patterns: readonly string[]) =>
    values.some((raw) => patterns.some((pattern) => matchesOne(raw, vocabulary, pattern)));
  return (included.length === 0 || hits(included)) && !hits(excluded);
};
