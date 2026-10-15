import type { Document } from "../document/document.ts";
import { TroveError } from "../errors.ts";
import { eolOf, insert, type Patch, replace } from "./patch.ts";

const SEPARATOR = ": ";
const NEEDS_QUOTES = /: | #|^[\s"'[\]{}>|*&!%@`#,]|\s$/;

const ESCAPED = /["\\]/g;

/** Double quotes escape `\` and `"`, so Windows paths stay valid YAML. */
export const formatValue = (value: string, quoted = false): string =>
  quoted || NEEDS_QUOTES.test(value) ? `"${value.replace(ESCAPED, "\\$&")}"` : value;

/** Rewrites a header field in place, or adds it before the closing `---`. */
export const setField = (doc: Document, key: string, value: string): Patch => {
  const frontMatter = doc.frontMatter;
  if (!frontMatter) throw new TroveError(`${doc.rel} has no front matter`);

  const field = frontMatter.fields.get(key);
  const line = field ? doc.lines[field.line - 1] : undefined;
  if (line) {
    const start = line.start + key.length + SEPARATOR.length;
    const quoted = line.text
      .slice(key.length + SEPARATOR.length)
      .trimStart()
      .startsWith('"');
    return replace({ start, end: line.end }, formatValue(value, quoted));
  }

  const fence = doc.lines[frontMatter.endLine - 1];
  if (!fence) throw new TroveError(`${doc.rel}: broken front matter`);
  return insert(fence.start, `${key}${SEPARATOR}${formatValue(value)}${eolOf(doc.text)}`);
};
