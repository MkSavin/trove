const STOP_WORDS = new Set([
  ...["the", "and", "for", "with", "from", "that", "this", "not", "are", "was", "but", "when"],
  ...["into", "its", "has", "have", "all", "any", "one", "out", "after", "before", "while", "only"],
  ...["что", "это", "для", "при", "как", "или", "так", "без", "его", "все", "она", "они", "нет"],
  ...["где", "если", "уже", "еще", "после", "только", "когда"],
]);
const MIN_LENGTH = 3;
/** A prefix cuts most endings in Russian and English alike, so word forms meet. */
const STEM_LENGTH = 6;
const ENGLISH_ENDING = /(?:ing|ed|es|s)$/;
const LATIN = /^[a-z]+$/;
const WORD_BREAK = /[^\p{L}\p{N}]+/u;
const LINK_TARGET = /\]\([^)]*\)/g;

const stem = (word: string): string => {
  const base = LATIN.test(word) && word.length > 4 ? word.replace(ENGLISH_ENDING, "") : word;
  return base.slice(0, STEM_LENGTH);
};

/** Crude stems of the meaningful words, in any case and punctuation; link targets are left out. */
export const wordStems = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .replace(LINK_TARGET, "]")
      .toLowerCase()
      .replaceAll("ё", "е")
      .split(WORD_BREAK)
      .filter((word) => word.length >= MIN_LENGTH && !STOP_WORDS.has(word))
      .map(stem),
  );

export const sharedCount = (a: ReadonlySet<string>, b: ReadonlySet<string>): number =>
  [...a].filter((word) => b.has(word)).length;

/** Shared words out of all distinct words of both (Jaccard). */
export const similarity = (shared: number, a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  shared === 0 ? 0 : shared / (a.size + b.size - shared);
