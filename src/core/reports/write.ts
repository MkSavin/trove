import { join } from "node:path";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { parseFrontMatter } from "../markdown/front-matter.ts";
import { splitLines } from "../text/lines.ts";
import { planEmbeds } from "./embeds.ts";
import { renderReport } from "./render.ts";

export type ReportResult = { name: string; output: string; rows: number; changed: boolean };

export type PlannedReport = ReportResult & { text: string };

const previousDate = (text: string): string | undefined =>
  parseFrontMatter(splitLines(text))?.fields.get("date")?.value;

/** An unchanged report keeps its old date, so rebuilding it is not a diff. */
export const planReport = (
  name: string,
  index: StoreIndex,
  previous: string | undefined,
): PlannedReport => {
  const report = index.config.reports[name];
  if (!report) throw new TroveError(`no report ${name} in the config`);

  const date = previous === undefined ? undefined : previousDate(previous);
  const same = date === undefined ? undefined : renderReport(report, index, date);
  if (same && same.text === previous) {
    return { name, output: report.output, rows: same.rows, changed: false, text: same.text };
  }
  const fresh = renderReport(report, index, index.today);
  return { name, output: report.output, rows: fresh.rows, changed: true, text: fresh.text };
};

export const readOutput = async (
  index: StoreIndex,
  output: string,
): Promise<string | undefined> => {
  const file = Bun.file(join(index.root, output));
  return (await file.exists()) ? file.text() : undefined;
};

const outputOf = (index: StoreIndex, name: string): string => {
  const report = index.config.reports[name];
  if (!report) throw new TroveError(`no report ${name} in the config`);
  return report.output;
};

export const planReports = (
  index: StoreIndex,
  names: readonly string[],
): Promise<PlannedReport[]> =>
  Promise.all(
    names.map(async (name) =>
      planReport(name, index, await readOutput(index, outputOf(index, name))),
    ),
  );

/** The named reports plus the config tables embedded in files such as AGENTS.md. */
export const planGenerated = async (
  index: StoreIndex,
  names: readonly string[],
): Promise<PlannedReport[]> => [...(await planReports(index, names)), ...(await planEmbeds(index))];

export const writeReports = async (
  index: StoreIndex,
  names: readonly string[],
): Promise<ReportResult[]> => {
  const planned = await planGenerated(index, names);
  await Promise.all(
    planned
      .filter((report) => report.changed)
      .map((report) => Bun.write(join(index.root, report.output), report.text)),
  );
  return planned.map(({ text: _, ...result }) => result);
};
