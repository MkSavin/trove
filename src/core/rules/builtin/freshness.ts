import { staleDays } from "../../document/freshness.ts";
import { defineRule } from "../rule.ts";

export const stale = defineRule({
  id: "stale",
  level: "info",
  summary: "Work documents are re-checked against the code within the freshness limit.",
  scope: "document",
  check: (doc, { config, index }) => {
    const days = staleDays(doc, config, index.today);
    if (days === undefined) return [];
    return [{ line: 1, message: `not checked for ${days} days`, hint: doc.meta.verify }];
  },
});
