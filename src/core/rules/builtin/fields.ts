import { fieldSpecs } from "../../config/vocabulary.ts";
import { isIsoDate } from "../../text/dates.ts";
import { defineRule } from "../rule.ts";

export const requiredField = defineRule({
  id: "required-field",
  level: "error",
  summary: "Fields marked required for the document type are present.",
  scope: "document",
  check: (doc, { config }) =>
    Object.entries(fieldSpecs(config, doc.typeConfig))
      .filter(([key, spec]) => spec.required && !Object.hasOwn(doc.meta, key))
      .map(([key]) => ({ line: 1, message: `missing field ${key}` })),
});

export const fieldFormat = defineRule({
  id: "field-format",
  level: "error",
  summary: "Date fields hold a real YYYY-MM-DD date.",
  scope: "document",
  check: (doc, { config }) => {
    const specs = fieldSpecs(config, doc.typeConfig);
    return [...(doc.frontMatter?.fields.values() ?? [])]
      .filter(({ key, value }) => specs[key]?.format === "date" && !isIsoDate(value))
      .map(({ key, value, line }) => ({
        line,
        message: `${key} is not a YYYY-MM-DD date: ${value}`,
      }));
  },
});

export const unknownField = defineRule({
  id: "unknown-field",
  level: "warn",
  summary: "Front matter holds only fields the config declares.",
  scope: "document",
  check: (doc, { config }) => {
    const specs = fieldSpecs(config, doc.typeConfig);
    return [...(doc.frontMatter?.fields.values() ?? [])]
      .filter(({ key }) => !Object.hasOwn(specs, key))
      .map(({ key, line }) => ({ line, message: `unknown field ${key}` }));
  },
});
