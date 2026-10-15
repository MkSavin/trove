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
