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
    if (parses(lines.map(({ text }) => text).join("\n"))) return [];
    const broken = lines.filter(({ text }) => TOP_LEVEL.test(text) && !parses(text));
    return (broken.length > 0 ? broken : [{ line: 1, text: "" }]).map(({ line }) => ({
      line,
      message: "front matter is not valid YAML: put a value holding `: ` or ` #` in quotes",
    }));
  },
});
