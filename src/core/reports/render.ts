import { posix } from "node:path";
import type { ReportConfig } from "../config/schema.ts";
import type { StoreIndex } from "../index/index.ts";
import { generatedHeader } from "./header.ts";
import { renderSection } from "./section.ts";

export type RenderedReport = { text: string; rows: number };

export const renderReport = (
  report: ReportConfig,
  index: StoreIndex,
  date: string,
): RenderedReport => {
  const outputDir = posix.dirname(report.output);
  const sections = report.sections.map((section) => renderSection(section, index, outputDir));
  const body = sections.flatMap((section) => section.blocks).map((block) => block.join("\n"));
  return {
    text: `${[...generatedHeader(report, index.config, date), body.join("\n\n")].join("\n")}\n`,
    rows: sections.reduce((sum, section) => sum + section.rows, 0),
  };
};
