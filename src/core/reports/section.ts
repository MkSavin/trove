import type { ReportSection } from "../config/schema.ts";
import type { StoreIndex } from "../index/index.ts";
import { selectDocuments, selectItems } from "../index/query.ts";
import { compareNatural, compareText } from "../text/compare.ts";
import { cellText, columnLabel, groupTitle, type ReportRow, rowField, rowValues } from "./cells.ts";

export type RenderedSection = { blocks: string[][]; rows: number };

const selectRows = (section: ReportSection, index: StoreIndex): ReportRow[] =>
  section.from === "items"
    ? selectItems(index, section.where)
    : selectDocuments(index, section.where);

export const sortRows = (
  rows: ReportRow[],
  keys: readonly string[],
  index: StoreIndex,
): ReportRow[] =>
  rows.toSorted((a, b) => {
    for (const key of keys) {
      const order = compareNatural(rowField(a, key, index) ?? "", rowField(b, key, index) ?? "");
      if (order !== 0) return order;
    }
    return 0;
  });

export const tableLines = (
  labels: readonly string[],
  rows: readonly (readonly string[])[],
): string[] => {
  const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
  return [
    line(labels),
    line(labels.map((label) => "-".repeat(Math.max(label.length, 1)))),
    ...rows.map(line),
  ];
};

const renderTable = (
  rows: readonly ReportRow[],
  section: ReportSection,
  index: StoreIndex,
  outputDir: string,
): string[] =>
  tableLines(
    section.columns.map((column) => columnLabel(column, index)),
    rows.map((row) => section.columns.map((c) => cellText(row, c, index, outputDir))),
  );

/** Rows by value of the field; a row of several values counts under each. */
export const groupByField = <Row extends ReportRow>(
  rows: readonly Row[],
  field: string,
  index: StoreIndex,
): Map<string, Row[]> => {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    for (const value of rowValues(row, field, index)) {
      groups.set(value, [...(groups.get(value) ?? []), row]);
    }
  }
  return groups;
};

export const renderCounts = (
  rows: readonly ReportRow[],
  field: string,
  index: StoreIndex,
  { label, outputDir }: { label?: string | undefined; outputDir: string },
): string[] => {
  const counts = [...groupByField(rows, field, index)]
    .toSorted(([a], [b]) => compareNatural(a, b))
    .map(([value, members]) => [
      groupTitle(value, field, outputDir) || "—",
      String(members.length),
    ]);
  const header = label ?? columnLabel({ key: field, label: undefined, empty: undefined }, index);
  return tableLines([header, index.config.labels.count], counts);
};

/** Configured groups first, in their order; the rest by name, archived documents last. */
export const groupRows = <Row extends ReportRow>(
  rows: readonly Row[],
  section: Pick<ReportSection, "groupBy" | "groupOrder">,
  index: StoreIndex,
) => {
  const groups = groupByField(rows, section.groupBy ?? "", index);
  const archived = (name: string) => name.startsWith(`${index.config.archive.folder}/`);
  const rest = [...groups.keys()]
    .filter((name) => !section.groupOrder.includes(name))
    .sort((a, b) => Number(archived(a)) - Number(archived(b)) || compareText(a, b));
  return [...section.groupOrder, ...rest].flatMap((name) => {
    const members = groups.get(name);
    return members ? [{ name, members }] : [];
  });
};

export const renderSection = (
  section: ReportSection,
  index: StoreIndex,
  outputDir: string,
): RenderedSection => {
  const rows = sortRows(selectRows(section, index), section.sort, index);
  if (rows.length === 0) return { blocks: [], rows: 0 };

  if (section.count) {
    const title = section.title ? [`## ${section.title}`, ""] : [];
    return {
      blocks: [[...title, ...renderCounts(rows, section.count, index, { outputDir })]],
      rows: 0,
    };
  }

  const table = (members: readonly ReportRow[]) => renderTable(members, section, index, outputDir);
  if (!section.groupBy) {
    const title = section.title ? [`## ${section.title}`, ""] : [];
    return { blocks: [[...title, ...table(rows)]], rows: rows.length };
  }

  const level = section.title ? "###" : "##";
  const title = section.title ? [[`## ${section.title}`]] : [];
  const groups = groupRows(rows, section, index).map(({ name, members }) => [
    `${level} ${groupTitle(name, section.groupBy ?? "", outputDir)}`,
    "",
    ...table(members),
  ]);
  return { blocks: [...title, ...groups], rows: rows.length };
};
