import type { Config } from "../config/schema.ts";
import { hasCapability, labelOf, ledgerOf } from "../config/vocabulary.ts";
import { PROMPT_MARKER } from "../document/prompt.ts";
import { formatValue } from "../edit/front-matter.ts";
import { formatRow } from "../edit/ledger.ts";
import { TroveError } from "../errors.ts";

export type NewDocument = {
  type: string;
  name: string;
  title: string;
  status: string;
  date: string;
  /** Header fields after the standard ones, in order. */
  fields: readonly (readonly [string, string])[];
};

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

const ledgerSection = (config: Config, type: string): string[] => {
  const ledger = ledgerOf(config, config.types[type]);
  if (!ledger) return [];
  const labels = ledger.columns.map((column) => column.label);
  return [
    `## ${config.labels.ledger}`,
    "",
    `<!-- ${ledger.marker} -->`,
    formatRow(labels),
    formatRow(labels.map((label) => "-".repeat(Math.max(label.length, 1)))),
    `<!-- /${ledger.marker} -->`,
    "",
  ];
};

/**
 * `{{name}}`, `{{title}}`, `{{status}}`, `{{date}}` and any header field; a declared field that
 * was not given is left empty.
 */
export const fillTemplate = (
  template: string,
  input: NewDocument,
  declared: readonly string[],
): string => {
  const values: Record<string, string> = {
    ...Object.fromEntries(declared.map((key) => [key, ""])),
    ...Object.fromEntries(input.fields),
    type: input.type,
    name: input.name,
    title: input.title,
    status: input.status,
    date: input.date,
    checked: input.date,
  };
  const unknown = new Set(
    [...template.matchAll(PLACEHOLDER)]
      .map(([whole, key = ""]) => (Object.hasOwn(values, key) ? "" : whole))
      .filter(Boolean),
  );
  if (unknown.size > 0) {
    const names = [...unknown].join(", ");
    throw new TroveError(`the ${input.type} template uses ${names}, not a field of ${input.type}`);
  }
  return template.replace(PLACEHOLDER, (_, key: string) => values[key] ?? "");
};

export const renderNewDocument = (config: Config, input: NewDocument): string => {
  const kind = config.types[input.type];
  const { statusLine, checked } = config.labels;
  const status = labelOf(config.statuses, input.status);
  return [
    "---",
    `type: ${input.type}`,
    `status: ${status}`,
    `date: ${input.date}`,
    `checked: ${input.date}`,
    ...input.fields.map(([key, value]) => `${key}: ${formatValue(value)}`),
    "---",
    "",
    `# ${input.name} — ${input.title}`,
    "",
    ...(hasCapability(kind, "status-line")
      ? [`**${statusLine}:** ${status}. ${checked} ${input.date}.`, ""]
      : []),
    ...(hasCapability(kind, "ledger") ? ledgerSection(config, input.type) : []),
    ...(hasCapability(kind, "prompt-body") ? [`<!-- ${PROMPT_MARKER} -->`, ""] : []),
  ].join("\n");
};
