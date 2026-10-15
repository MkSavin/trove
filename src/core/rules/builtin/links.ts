import { resolveLinks } from "../../index/links.ts";
import { defineRule } from "../rule.ts";

export const deadLink = defineRule({
  id: "dead-link",
  level: "warn",
  summary: "Relative links reach a file in the store or in a code root checked out here.",
  scope: "document",
  check: (doc, { index }) =>
    resolveLinks(index, doc)
      .filter((link) => link.state === "dead")
      .map((link) => ({ line: link.line, message: `dead link: ${link.target}` })),
});
