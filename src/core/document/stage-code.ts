export type StageCode = {
  /** `Э1`, `S2`, `Stage 3` as written. */
  code: string;
  /** Codes of one plan share it: `э`, `s`, `stage`. */
  prefix: string;
  rest: string;
};

const KEYWORD_CODE =
  /^((stage|phase|step|milestone|этап|фаза|шаг|веха)\s*\d+(?:\.\d+)*)(?![\p{L}\p{N}])/iu;
const LETTER_CODE = /^((\p{Lu}{1,3})\d+(?:\.\d+)*)(?![\p{L}\p{N}])/u;
const SEPARATOR = /^\s*[.):—–-]*\s*/;
const NUMBER = /^#?\d+(?:\.\d+)*[.)]?$/;

/** `Э1. Catalog` → `Э1` and `Catalog`; `S3 bucket` is a code too, so callers ask for a run of them. */
export const stageCode = (text: string): StageCode | undefined => {
  const match = KEYWORD_CODE.exec(text) ?? LETTER_CODE.exec(text);
  if (!match) return undefined;
  const [whole, code = "", prefix = ""] = match;
  return {
    code,
    prefix: prefix.toLowerCase(),
    rest: text.slice(whole.length).replace(SEPARATOR, ""),
  };
};

/** `1`, `#2`, `3.` or a lone `Э4`: a stage's number rather than its name. */
export const isBareNumber = (text: string): boolean =>
  NUMBER.test(text) || stageCode(text)?.rest === "";
