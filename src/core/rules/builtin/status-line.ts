import { hasCapability } from "../../config/vocabulary.ts";
import { defineRule, type Finding } from "../rule.ts";

const mismatch = (what: string, line: string | undefined, header: string | undefined) =>
  line === header ? [] : [`status line ${what} ${line}, header ${header}`];

export const statusLine = defineRule({
  id: "status-line",
  level: "error",
  summary: "The visible status line repeats the header's status and checked date.",
  scope: "document",
  check: (doc, { config }): Finding[] => {
    if (!hasCapability(doc.typeConfig, "status-line")) return [];
    const { statusLine: label, checked } = config.labels;
    const found = doc.statusLine;
    if (!found) return [{ line: 1, message: `no **${label}:** line` }];

    const messages = found.parsed
      ? [
          ...mismatch("says", found.parsed.status, doc.meta.status),
          ...mismatch("date", found.parsed.checked, doc.meta.checked),
        ]
      : [`status line must read: **${label}:** <status>. <note> ${checked} <date>.`];
    return messages.map((message) => ({ line: found.line.number, message }));
  },
});
