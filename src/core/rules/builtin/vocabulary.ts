import { labelOf } from "../../config/vocabulary.ts";
import type { Document } from "../../document/document.ts";
import { defineRule } from "../rule.ts";

const lineOf = (doc: Document, key: string): number => doc.frontMatter?.fields.get(key)?.line ?? 1;

export const knownType = defineRule({
  id: "known-type",
  level: "error",
  summary: "The type is declared under `types:`.",
  scope: "document",
  check: (doc) =>
    doc.type !== undefined && !doc.typeConfig
      ? [{ line: lineOf(doc, "type"), message: `unknown type: ${doc.type}` }]
      : [],
});

export const knownStatus = defineRule({
  id: "known-status",
  level: "error",
  summary: "The status is declared under `statuses:`.",
  scope: "document",
  check: (doc) =>
    doc.meta.status !== undefined && doc.status === undefined
      ? [{ line: lineOf(doc, "status"), message: `unknown status: ${doc.meta.status}` }]
      : [],
});

export const typeStatus = defineRule({
  id: "type-status",
  level: "error",
  summary: "The status is one the document type allows.",
  scope: "document",
  check: (doc, { config }) => {
    const allowed = doc.typeConfig?.statuses;
    if (!allowed || doc.status === undefined || allowed.includes(doc.status)) return [];
    const labels = allowed.map((key) => labelOf(config.statuses, key)).join(", ");
    return [
      {
        line: lineOf(doc, "status"),
        message: `${doc.type} cannot be ${doc.meta.status}; allowed: ${labels}`,
      },
    ];
  },
});
