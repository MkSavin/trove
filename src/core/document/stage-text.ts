import { isBareNumber } from "./stage-code.ts";

const CODE_SPAN = /(`+)(.*?)\1/g;
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const AUTOLINK = /<((?:https?|mailto):[^>]+)>/g;
const STRONG = /(\*\*|__|~~)(.+?)\1/g;
const EMPHASIS = /(^|[^\p{L}\p{N}])([*_])(?!\s)(.+?)(?<!\s)\2(?![\p{L}\p{N}])/gu;
const SPACES = /\s+/g;
const SENTENCE_END = /[.!?…](?=\s|$)/gu;
const TITLE_LENGTH = 80;

/** Bold, italics, code and links reduced to their text. */
export const stripMarkup = (text: string): string =>
  text
    .replace(CODE_SPAN, "$2")
    .replace(LINK, "$1")
    .replace(AUTOLINK, "$1")
    .replace(STRONG, "$2")
    .replace(EMPHASIS, "$1$3")
    .replace(SPACES, " ")
    .trim();

/** Up to the first sentence end that does not just close a stage number such as `1.` or `Э2.` */
const firstSentence = (text: string): string => {
  for (const { index, 0: mark } of text.matchAll(SENTENCE_END)) {
    if (!isBareNumber(text.slice(0, index + 1))) {
      return text.slice(0, mark === "." ? index : index + 1);
    }
  }
  return text;
};

/** The first sentence of the plain text, cut at a word to about 80 characters. */
export const shortTitle = (text: string): string => {
  const sentence = firstSentence(stripMarkup(text)).trim();
  if (sentence.length <= TITLE_LENGTH) return sentence;
  const space = sentence.lastIndexOf(" ", TITLE_LENGTH);
  return `${sentence.slice(0, space > TITLE_LENGTH / 2 ? space : TITLE_LENGTH).trimEnd()}…`;
};
