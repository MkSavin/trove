import type { Item } from "../document/ledger.ts";
import { type LineRange, rangesOverlap } from "../text/line-range.ts";
import { sharedCount, similarity, wordStems } from "../text/words.ts";
import { itemCodeRefs } from "./code-refs.ts";
import type { StoreIndex } from "./index.ts";
import { type CodeRef, rootKey } from "./links.ts";

/** `shared` names a file both point at with overlapping lines. */
export type SimilarPair = {
  first: Item;
  second: Item;
  percent: number;
  shared: CodeRef | undefined;
};

/** One shared word is a coincidence, not a duplicate. */
const MIN_SHARED = 2;

type Entry = { item: Item; words: ReadonlySet<string>; refs: readonly CodeRef[] };

type Pair = { a: number; b: number; shared: CodeRef | undefined };

const entriesOf = (index: StoreIndex): Entry[] =>
  index.items
    .filter((item) => item.open && !item.closed)
    .map((item) => {
      const doc = index.byRel.get(item.document);
      return {
        item,
        words: wordStems(item.values.what ?? ""),
        refs: doc ? itemCodeRefs(index, doc, item) : [],
      };
    });

const append = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
};

/** Found through a word → entries index rather than by comparing every pair. */
const wordPairs = (entries: readonly Entry[]): Pair[] => {
  const byWord = new Map<string, number[]>();
  entries.forEach(({ words }, at) => {
    for (const word of words) append(byWord, word, at);
  });
  return entries.flatMap(({ words }, a) => {
    const counts = new Map<number, number>();
    for (const word of words) {
      for (const b of byWord.get(word) ?? []) if (b > a) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, count]) => count >= MIN_SHARED)
      .map(([b]) => ({ a, b, shared: undefined }));
  });
};

const codePairs = (entries: readonly Entry[]): Pair[] => {
  const byFile = new Map<string, { at: number; ref: CodeRef; lines: LineRange }[]>();
  entries.forEach(({ refs }, at) => {
    for (const ref of refs) {
      if (ref.lines)
        append(byFile, `${rootKey(ref.root)}\0${ref.path}`, { at, ref, lines: ref.lines });
    }
  });
  return [...byFile.values()].flatMap((named) =>
    named.flatMap((first, i) =>
      named
        .slice(i + 1)
        .filter((second) => second.at !== first.at && rangesOverlap(first.lines, second.lines))
        .map((second) => ({
          a: Math.min(first.at, second.at),
          b: Math.max(first.at, second.at),
          shared: first.ref,
        })),
    ),
  );
};

/** Code pairs come last, so a pair found both ways keeps its shared file. */
const candidates = (entries: readonly Entry[]): Pair[] => [
  ...new Map(
    [...wordPairs(entries), ...codePairs(entries)].map((pair) => [`${pair.a}:${pair.b}`, pair]),
  ).values(),
];

/**
 * Open items whose `what` shares at least `percent` of its words with another's, or half that
 * when both name overlapping lines of one file. Each pair comes once.
 */
export const similarItems = (index: StoreIndex, percent: number): SimilarPair[] => {
  const entries = entriesOf(index);
  return candidates(entries).flatMap(({ a, b, shared }): SimilarPair[] => {
    const [first, second] = [entries[a], entries[b]];
    if (!first || !second) return [];
    const score = similarity(sharedCount(first.words, second.words), first.words, second.words);
    if (score * 100 < (shared ? percent / 2 : percent)) return [];
    return [{ first: first.item, second: second.item, percent: Math.round(score * 100), shared }];
  });
};
