import type { Config, LedgerConfig } from "../config/schema.ts";
import { labelOf } from "../config/vocabulary.ts";
import { PROMPT_MARKER } from "../document/prompt.ts";
import type { Rule } from "../rules/rule.ts";

export const TOPICS = [
  "overview",
  "placement",
  "types",
  "ledger",
  "lifecycle",
  "rules",
  "workflow",
] as const;
export type Topic = (typeof TOPICS)[number];

const table = (head: readonly string[], rows: readonly (readonly string[])[]): string =>
  [head, head.map(() => "--"), ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n");

const code = (value: string): string => `\`${value}\``;

const overview = (config: Config): string => {
  const { statusLine, checked } = config.labels;
  const fields = Object.entries(config.fields).map(([key, spec]) => [
    code(key),
    spec.required ? "required" : "optional",
    spec.format,
  ]);
  return `# Store overview

Every document is Markdown with a front matter. Work folders hold live documents; \`${config.archive.folder}/\` mirrors them for finished ones, with status ${code(labelOf(config.statuses, config.archive.status))}.

The first lines of the body repeat the status for readers: \`**${statusLine}:** <status>. <note> ${checked} <YYYY-MM-DD>.\` It must match the \`status\` and \`checked\` fields.

## Statuses

${table(
  ["key", "label"],
  Object.entries(config.statuses).map(([key, label]) => [code(key), label]),
)}

## Header fields of every type

${table(["field", "presence", "format"], fields)}

## Folders

${table(
  ["folder", "prefix", "types"],
  Object.entries(config.folders).map(([name, folder]) => [
    `${name}/`,
    folder.prefix.map(code).join(", "),
    folder.types.join(", "),
  ]),
)}
`;
};

/** Where a type lives: its folder and prefix, or the store root for documents kept there. */
const placeOf = (config: Config, type: string): string => {
  const folders = Object.entries(config.folders).filter(([, folder]) =>
    folder.types.includes(type),
  );
  if (folders.length === 0) return "store root";
  return folders
    .map(
      ([name, folder]) =>
        `${name}/${folder.prefix[folder.types.indexOf(type)] ?? folder.prefix[0] ?? ""}`,
    )
    .join(", ");
};

/** The table a store's AGENTS.md shows as "what goes where", built from each type's purpose. */
export const placementTable = (config: Config): string =>
  table(
    ["type", "where", "what belongs here"],
    Object.entries(config.types).map(([name, type]) => [
      code(name),
      code(placeOf(config, name)),
      type.purpose ?? "—",
    ]),
  );

const placement = (config: Config): string => `# What goes where

Pick the type by what the document is, not by the folder it would sit in. A document that changes nature, such as research that turns into a plan of work, changes type: \`trove doc retype\`.

${placementTable(config)}

Finished documents move to \`${config.archive.folder}/\` under the same path.
`;

const types = (config: Config): string => `# Document types

A type is a set of capabilities. \`ledger\`: a table of open items; \`status-line\`: the visible status line; \`freshness\`: re-check within the limit; \`prompt-body\`: task text after \`<!-- ${PROMPT_MARKER} -->\`; \`generated\`: built by reports, never edited; \`series\`: numbered \`_N\`; \`versions\`: \`_V2\` with \`supersedes\`; \`resolved-of\`: the closed items of the document named in \`base\`, in a ledger of the same columns; \`stages\`: the first task list, table with a status column, or run of headings or bold labels coded like \`Э1\` or \`Stage 2\` holds the stages, read as \`progress\` and \`next\` while the document is not finished.

${table(
  ["type", "capabilities", "statuses", "starts as", "own fields"],
  Object.entries(config.types).map(([name, type]) => [
    code(name),
    type.capabilities.join(", ") || "—",
    type.statuses?.map((key) => labelOf(config.statuses, key)).join(", ") ?? "any",
    type.initial ? labelOf(config.statuses, type.initial) : "—",
    Object.entries(type.fields)
      .map(([key, spec]) => `${key}${spec.required ? "" : "?"}`)
      .join(", ") || "—",
  ]),
)}
`;

const ledgerSpec = (title: string, spec: LedgerConfig): string => `## ${title}

${table(
  ["column", "label", "required", "values"],
  spec.columns.map((column) => [
    code(column.key),
    column.label,
    column.required ? "yes" : "no",
    column.enum ? Object.values(column.enum).join(", ") : "free text",
  ]),
)}

Ids follow ${code(spec.id)}; open means ${spec.open.map(code).join(", ")}; an item is closed as ${Object.values(spec.closed).map(code).join(", ")}, its heading noted ${code(spec.note)}.
`;

const ledger = (config: Config): string => {
  const own = Object.entries(config.types).flatMap(([name, type]) =>
    type.ledger ? [ledgerSpec(`Ledger of ${name}`, type.ledger)] : [],
  );
  const specs = [...(config.ledger ? [ledgerSpec("Ledger", config.ledger)] : []), ...own];
  if (specs.length === 0) return "# Ledger\n\nThis store has no ledger.\n";
  return `# Ledger

Open items live in table blocks between \`<!-- ledger -->\` and \`<!-- /ledger -->\`; a document may have several. Columns are found by their header label, so optional columns may be left out of a table, and the heading above a table becomes the items' \`section\`.

- Ids use an ASCII hyphen and are never reused.
- No \`|\` inside a cell: it splits the row and the item silently drops out of reports.
- Every item has its own section, headed \`### <id>. <one line> (<status>)\`; closing it removes the row and marks the heading.

${specs.join("\n")}`;
};

const lifecycle = (config: Config): string => {
  const steps = Object.entries(config.lifecycle).flatMap(([type, list]) =>
    list.map((step) => [
      code(type),
      typeof step.when === "object"
        ? `status ${labelOf(config.statuses, step.when.status)}`
        : step.when,
      step.place,
    ]),
  );
  return `# Lifecycle

${table(["type", "when", "belongs in"], steps)}

Work documents not re-checked for ${config.freshness.default} days (unless the type sets its own limit) are reported as stale, with their \`verify\` hint.

A \`verify-cmd\` header field makes the re-check repeatable: a shell command, with \`{root:<name>}\` and \`{store}\` for absolute paths, that exits 0 while what the document describes still holds. \`trove check --verify\` runs those of the documents in work.
`;
};

const rules = (config: Config, all: readonly Rule[]): string => `# Rules

${table(
  ["rule", "level", "checks"],
  all.map((rule) => {
    const setting = config.rules[rule.id];
    const level = setting?.level ?? rule.level;
    return [
      code(rule.id),
      setting?.since ? `${level} since ${setting.since}` : level,
      rule.summary,
    ];
  }),
)}
`;

const WORKFLOW = `# Working with the store

- Read slices, not files: query items or documents with filters, then show one item or one section.
- Items with \`drift=true\` link from their section to code that changed after their document was checked: they may already be fixed, re-check them first.
- Edit through the tools, not by rewriting files: they patch only their own lines, refuse changes that add errors and rebuild generated reports in the same step.
- Create documents from their type's template; add items to a ledger instead of typing rows; close an item when the fix is merged, with its commit.
- An audit whose last open item closes moves to the archive in the same step.
- After a manual edit, run the check and then sync, so the reports and the commit stay in step.
- A finding is short: what breaks for the user in plain words, where in the code, how to fix it.
`;

/** The regulation of this store, generated from its config so prose and data cannot drift. */
export const regulation = (config: Config, all: readonly Rule[], topic: Topic): string => {
  switch (topic) {
    case "overview":
      return overview(config);
    case "types":
      return types(config);
    case "ledger":
      return ledger(config);
    case "lifecycle":
      return lifecycle(config);
    case "rules":
      return rules(config, all);
    case "placement":
      return placement(config);
    case "workflow":
      return WORKFLOW;
  }
};
