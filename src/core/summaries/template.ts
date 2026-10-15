import { join } from "node:path";
import type { Config, SummaryConfig } from "../config/schema.ts";
import { hasCapability, labelOf, typeConfig } from "../config/vocabulary.ts";
import { formatValue } from "../edit/front-matter.ts";
import type { Filters } from "../index/query.ts";

export type SummaryDraft = {
  kind: string;
  title: string;
  status: string;
  date: string;
  scope: string;
  filter: Filters;
  /** Text after the status line; `{{title}}`, `{{date}}` and `{{kind}}` are filled in. */
  body: string;
};

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Counts, open items by document and documents in work, with places for the model to write. */
export const defaultBody = (config: Config): string =>
  [
    "<!-- write: one paragraph — what this summary covers, what it leaves out and what it was checked against -->",
    "",
    "<!-- write: what to look at first, with reasons -->",
    "",
    `## ${config.labels.summaryCounts}`,
    "",
    "<!-- trove:counts by=priority -->",
    "<!-- /trove:counts -->",
    "",
    `## ${config.labels.summaryItems}`,
    "",
    "<!-- trove:items group=document -->",
    "<!-- /trove:items -->",
    "",
    `## ${config.labels.summaryDocuments}`,
    "",
    '<!-- trove:documents place=work type=spec,plan,study as=list format="{document} — {status}" -->',
    "<!-- /trove:documents -->",
    "",
    "<!-- write: what is not verified yet -->",
    "",
  ].join("\n");

export const loadBody = async (
  root: string,
  config: Config,
  kind: SummaryConfig,
): Promise<string> =>
  kind.template ? Bun.file(join(root, kind.template)).text() : defaultBody(config);

/** `{ path: ["!a/**"], owner: ["web"] }` → `path=!a/** owner=web`, as the `filter:` header holds it. */
export const filterText = (filters: Filters): string =>
  Object.entries(filters)
    .map(([field, values]) => `${field}=${values.join(",")}`)
    .join(" ");

export const renderDraft = (config: Config, draft: SummaryDraft): string => {
  const status = labelOf(config.statuses, draft.status);
  const { statusLine, checked } = config.labels;
  const values: Record<string, string> = { title: draft.title, date: draft.date, kind: draft.kind };
  const filter = filterText(draft.filter);
  const type = config.summaries[draft.kind]?.type ?? "summary";
  const line = `**${statusLine}:** ${status}. ${checked} ${draft.date}.`;
  return [
    "---",
    `type: ${type}`,
    `status: ${status}`,
    `date: ${draft.date}`,
    `checked: ${draft.date}`,
    `scope: ${formatValue(draft.scope)}`,
    `kind: ${draft.kind}`,
    ...(filter ? [`filter: ${formatValue(filter)}`] : []),
    "---",
    "",
    `# ${draft.title} (${draft.date})`,
    "",
    ...(hasCapability(typeConfig(config, type), "status-line") ? [line, ""] : []),
    draft.body.replace(PLACEHOLDER, (whole, key: string) => values[key] ?? whole),
  ].join("\n");
};
