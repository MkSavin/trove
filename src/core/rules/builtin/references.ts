import { fieldSpecs } from "../../config/vocabulary.ts";
import { defineRule } from "../rule.ts";

const splitRefs = (value: string): string[] =>
  value
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);

export const headerRefs = defineRule({
  id: "header-refs",
  level: "error",
  summary: "Fields of format `refs` name documents that exist in the store.",
  scope: "document",
  check: (doc, { config, index }) => {
    const specs = fieldSpecs(config, doc.typeConfig);
    return [...(doc.frontMatter?.fields.values() ?? [])]
      .filter(({ key }) => specs[key]?.format === "refs")
      .flatMap(({ key, value, line }) =>
        splitRefs(value)
          .filter((ref) => !index.byName.has(ref))
          .map((ref) => ({ line, message: `${key}: no document ${ref}` })),
      );
  },
});
