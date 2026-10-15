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
 * A field passes when it matches one of the plain patterns (if any) and none of the `!` ones.
 * A missing field matches no pattern, so only negations accept it.
 */
export const fieldMatches = (
  raw: string | undefined,
  vocabulary: Vocabulary,
  wanted: readonly string[],
): boolean => {
  const excluded = wanted.filter((value) => value.startsWith(NOT)).map((value) => value.slice(1));
  const included = wanted.filter((value) => !value.startsWith(NOT));
  const hits = (patterns: readonly string[]) =>
    raw !== undefined && patterns.some((pattern) => matchesOne(raw, vocabulary, pattern));
  return (included.length === 0 || hits(included)) && !hits(excluded);
};
