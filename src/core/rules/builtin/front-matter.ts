import type { Document } from "../../document/document.ts";
import { defineRule } from "../rule.ts";

export const frontMatter = defineRule({
  id: "front-matter",
  level: "error",
  summary: "Every document opens with a `---` front matter block.",
  scope: "store",
  check: ({ index }) =>
    index.documents
      .filter((doc) => !doc.frontMatter)
      .map((doc) => ({ file: doc.rel, line: 1, message: "no front matter" })),
});

const LINE_BREAK = /\r?\n/;
const TOP_LEVEL = /^[^\s#]/;
/** An unquoted value with ` #`: YAML reads the rest as a comment and drops it. */
const CUT_BY_COMMENT = /^[^\s#][^:]*:\s+[^"'\s].*\s#/;

const parses = (yaml: string): boolean => {
  try {
    Bun.YAML.parse(yaml);
    return true;
  } catch {
    return false;
  }
};

/** File lines (1-based) of the front matter between its fences. */
const fieldLines = (doc: Document, endLine: number): { line: number; text: string }[] =>
  doc.text
    .split(LINE_BREAK)
    .slice(1, endLine - 1)
    .map((text, i) => ({ line: i + 2, text }));

export const frontMatterYaml = defineRule({
  id: "front-matter-yaml",
  level: "warn",
  summary: "The front matter is valid YAML, so other tools such as GitHub can read it too.",
  scope: "document",
  check: (doc) => {
    if (!doc.frontMatter) return [];
    const lines = fieldLines(doc, doc.frontMatter.endLine);
    const valid = parses(lines.map(({ text }) => text).join("\n"));
    const broken = lines.filter(
      ({ text }) => CUT_BY_COMMENT.test(text) || (!valid && TOP_LEVEL.test(text) && !parses(text)),
    );
    const found = broken.length > 0 || valid ? broken : [{ line: 1, text: "" }];
    return found.map(({ line }) => ({
      line,
      message: "a strict YAML reader breaks or cuts this value: put it in quotes",
    }));
  },
});
