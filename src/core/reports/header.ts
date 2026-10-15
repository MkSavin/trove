import type { Config, ReportConfig } from "../config/schema.ts";
import { hasCapability, labelOf, typeConfig } from "../config/vocabulary.ts";

/** Front matter, title and status line of a generated document: it passes `check` like any other. */
export const generatedHeader = (report: ReportConfig, config: Config, date: string): string[] => {
  const status = labelOf(config.statuses, report.status);
  const statusLine = [`${status}.`, report.note, `${config.labels.checked} ${date}.`]
    .filter(Boolean)
    .join(" ");
  const withStatusLine = hasCapability(typeConfig(config, report.type), "status-line");
  return [
    "---",
    `type: ${report.type}`,
    `status: ${status}`,
    `date: ${date}`,
    `checked: ${date}`,
    `scope: ${report.scope}`,
    "---",
    "",
    `# ${report.title}`,
    "",
    withStatusLine ? `**${config.labels.statusLine}:** ${statusLine}` : report.note,
    "",
    ...(report.intro ? [report.intro, ""] : []),
  ];
};
