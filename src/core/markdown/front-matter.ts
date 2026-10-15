import type { Line } from "../text/lines.ts";

export type Field = { key: string; value: string; line: number };

export type FrontMatter = {
  fields: ReadonlyMap<string, Field>;
  /** Line of the closing `---`. */
  endLine: number;
};

const FENCE = "---";
const SEPARATOR = ": ";
const DOUBLE_QUOTED = /^"(.*)"$/;
const SINGLE_QUOTED = /^'(.*)'$/;
const ESCAPE = /\\(["\\])/g;

const unquote = (raw: string): string => {
  const double = DOUBLE_QUOTED.exec(raw)?.[1];
  if (double !== undefined) return double.replace(ESCAPE, "$1");
  const single = SINGLE_QUOTED.exec(raw)?.[1];
  return single === undefined ? raw : single.replaceAll("''", "'");
};

/** Line-based `key: value` reading: values in such archives are free text that strict YAML rejects. */
export const parseFrontMatter = (lines: readonly Line[]): FrontMatter | undefined => {
  if (lines[0]?.text !== FENCE) return undefined;
  const end = lines.findIndex((line, i) => i > 0 && line.text === FENCE);
  if (end < 0) return undefined;

  const fields = new Map<string, Field>();
  for (const line of lines.slice(1, end)) {
    const at = line.text.indexOf(SEPARATOR);
    if (at < 0) continue;
    const key = line.text.slice(0, at);
    const value = unquote(line.text.slice(at + SEPARATOR.length).trim());
    fields.set(key, { key, value, line: line.number });
  }
  return { fields, endLine: end + 1 };
};
