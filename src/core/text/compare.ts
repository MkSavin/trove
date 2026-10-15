const TRAILING_NUMBER = /^(.*?)(\d*)$/s;

const split = (value: string): [head: string, tail: number] => {
  const [, head = "", digits = ""] = TRAILING_NUMBER.exec(value) ?? [];
  return [head, digits ? Number(digits) : 0];
};

/** Orders `WEB1-9` before `WEB1-10`; everything but the trailing number compares by code unit. */
export const compareNatural = (a: string, b: string): number => {
  const [aHead, aTail] = split(a);
  const [bHead, bTail] = split(b);
  if (aHead !== bHead) return aHead < bHead ? -1 : 1;
  return aTail - bTail;
};

export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
