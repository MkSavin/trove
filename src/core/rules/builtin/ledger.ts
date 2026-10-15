import { hasCapability, keyOf, ledgerOf } from "../../config/vocabulary.ts";
import { defineRule, type Finding, type StoreFinding } from "../rule.ts";

const NON_BREAKING_HYPHEN = "‑";
const TEMPLATE_PART = /\{(\w+)\}/;

/** Missing when the header lacks a field the template needs. */
const idPattern = (
  template: string,
  values: Readonly<Record<string, string | undefined>>,
): RegExp | undefined => {
  const parts = template.split(TEMPLATE_PART);
  const fields = parts.filter((part, i) => i % 2 === 1 && part !== "n");
  if (fields.some((name) => values[name] === undefined)) return undefined;

  const source = parts.map((part, i) => {
    if (i % 2 === 0) return RegExp.escape(part);
    return part === "n" ? ".+" : RegExp.escape(values[part] ?? "");
  });
  return new RegExp(`^${source.join("")}$`);
};

export const ledgerBlock = defineRule({
  id: "ledger-block",
  level: "error",
  summary: "Types with a ledger carry closed `<!-- ledger -->` blocks.",
  scope: "document",
  check: (doc, { config }) => {
    const ledger = ledgerOf(config, doc.typeConfig);
    if (!ledger || !hasCapability(doc.typeConfig, "ledger")) return [];
    const marker = ledger.marker;
    if (!doc.ledger) return [{ line: 1, message: `no <!-- ${marker} --> block` }];
    return doc.ledger.blocks
      .filter((block) => !block.close)
      .map((block) => ({ line: block.open.number, message: `<!-- ${marker} --> is never closed` }));
  },
});

export const ledgerColumns = defineRule({
  id: "ledger-columns",
  level: "error",
  summary: "Ledger tables have a header of known columns, required ones included.",
  scope: "document",
  check: (doc) => {
    const columns = doc.ledger?.config.columns ?? [];
    return (doc.ledger?.tables ?? []).flatMap((table): Finding[] => {
      if (!table.header)
        return [{ line: table.rows[0]?.line.number, message: "table without header" }];
      const line = table.header.line.number;
      const unknown = table.header.cells.filter((_, i) => table.keys[i] === undefined);
      const absent = columns.filter(
        (column) => column.required && !table.keys.includes(column.key),
      );
      return [
        ...unknown.map((label) => ({ line, message: `unknown column ${label}` })),
        ...absent.map((column) => ({ line, message: `missing column ${column.label}` })),
      ];
    });
  },
});

export const ledgerRowShape = defineRule({
  id: "ledger-row-shape",
  level: "error",
  summary: "Each ledger row has as many cells as its header: a `|` inside a cell breaks it.",
  scope: "document",
  check: (doc) =>
    (doc.ledger?.tables ?? []).flatMap((table) =>
      table.header
        ? table.rows
            .filter((row) => row.cells.length !== table.keys.length)
            .map((row) => ({
              line: row.line.number,
              message: `${row.cells.length} cells against ${table.keys.length} in the header; a | inside a cell?`,
            }))
        : [],
    ),
});

export const idHyphen = defineRule({
  id: "id-hyphen",
  level: "error",
  summary: "Item ids use the ASCII hyphen, never U+2011.",
  scope: "document",
  check: (doc) =>
    (doc.ledger?.items ?? [])
      .filter((item) => item.id.includes(NON_BREAKING_HYPHEN))
      .map((item) => ({ line: item.line, message: `${item.id} uses a non-breaking hyphen` })),
});

export const idFormat = defineRule({
  id: "id-format",
  level: "error",
  summary: "Item ids follow `ledger.id`, e.g. `{slug}-{n}`.",
  scope: "document",
  check: (doc) => {
    const ledger = doc.ledger?.config;
    if (!ledger) return [];
    return (doc.ledger?.items ?? []).flatMap((item) => {
      const code = item.section === undefined ? undefined : ledger.sections?.[item.section];
      if (code === undefined && ledger.id.includes("{section}")) {
        const message = `${item.id} sits under ${item.section ?? "no heading"}, which has no id code in sections`;
        return [{ line: item.line, message }];
      }
      const pattern = idPattern(ledger.id, { ...doc.meta, section: code });
      if (pattern?.test(item.id) !== false) return [];
      return [{ line: item.line, message: `${item.id} does not match ${ledger.id}` }];
    });
  },
});

export const itemEnum = defineRule({
  id: "item-enum",
  level: "error",
  summary: "Ledger cells with a vocabulary hold one of its values.",
  scope: "document",
  check: (doc) => {
    const enumerated = (doc.ledger?.config.columns ?? []).flatMap((column) =>
      column.enum ? [{ ...column, enum: column.enum }] : [],
    );
    return (doc.ledger?.items ?? []).flatMap((item) =>
      enumerated
        .filter((column) => {
          const value = item.values[column.key];
          return value !== undefined && keyOf(column.enum, value) === undefined;
        })
        .map((column) => ({
          line: item.line,
          message: `${column.label} of ${item.id} is outside the vocabulary: ${item.values[column.key]}`,
        })),
    );
  },
});

export const duplicateId = defineRule({
  id: "duplicate-id",
  level: "error",
  summary: "Item ids are unique across the store.",
  scope: "store",
  check: ({ index }) => {
    const first = new Map<string, string>();
    return index.items.flatMap((item): StoreFinding[] => {
      const seen = first.get(item.id);
      if (seen === undefined) {
        first.set(item.id, `${item.document}:${item.line}`);
        return [];
      }
      return [
        { file: item.document, line: item.line, message: `${item.id} is already at ${seen}` },
      ];
    });
  },
});
