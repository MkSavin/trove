import { hasCapability } from "../../config/vocabulary.ts";
import { PROMPT_MARKER } from "../../document/prompt.ts";
import { defineRule } from "../rule.ts";

export const promptBody = defineRule({
  id: "prompt-body",
  level: "error",
  summary: "Prompts mark where the task text starts with `<!-- prompt -->`.",
  scope: "document",
  check: (doc) =>
    hasCapability(doc.typeConfig, "prompt-body") && !doc.prompt
      ? [{ line: 1, message: `no <!-- ${PROMPT_MARKER} --> marker` }]
      : [],
});
