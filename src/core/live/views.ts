import { posix } from "node:path";
import { TroveError } from "../errors.ts";
import { mergeFilters } from "../index/filters.ts";
import type { StoreIndex } from "../index/index.ts";
import { type Filters, selectDocuments, selectItems } from "../index/query.ts";
import { placementTable } from "../regulation/regulation.ts";
import { cellText, columnLabel, groupTitle, type ReportRow } from "../reports/cells.ts";
import { groupRows, renderCounts, sortRows, tableLines } from "../reports/section.ts";

/** Where a block lives and what it inherits: links are relative to it, filters add up. */
export type ViewContext = { index: StoreIndex; rel: string; base: Filters };

const LAYOUT_KEYS = new Set(["as", "columns", "group", "sort", "by", "label", "format"]);
const EMPTY = "—";
const PLACEHOLDER = /\{(\w+)\}/g;

const DEFAULTS = {
  items: { columns: "id,priority,what", sort: "priority,id", format: "{id} — {what}" },
  documents: {
    columns: "document,status,verify",
    sort: "type,path",
    format: "{document} — {status}",
  },
  progress: {
    columns: "document,bar:progress,next",
    sort: "path",
    format: "{document} {bar} — {next}",
  },
} as const;

const list = (value: string): string[] => value.split(",").filter(Boolean);

const filtersOf = (args: Readonly<Record<string, string>>, base: Filters): Filters =>
  mergeFilters(
    base,
    Object.fromEntries(
      Object.entries(args)
        .filter(([key]) => !LAYOUT_KEYS.has(key))
        .map(([key, value]) => [key, list(value)]),
    ),
  );

const column = (key: string) => ({ key, label: undefined, empty: undefined });

/** `document:audit` relabels a column; a bare key keeps its configured label. */
const labelledColumn = (spec: string) => {
  const [key = spec, label] = spec.split(":");
  return { key, label, empty: undefined };
};

const formatRow = (row: ReportRow, format: string, context: ViewContext, dir: string): string =>
  format.replace(PLACEHOLDER, (_, key: string) => cellText(row, column(key), context.index, dir));

/** One way to lay rows out: a table, a bullet list from `format`, or ids on one line. */
const layout = (
  rows: readonly ReportRow[],
  args: Readonly<Record<string, string>>,
  defaults: (typeof DEFAULTS)[keyof typeof DEFAULTS],
  context: ViewContext,
): string[] => {
  const dir = posix.dirname(context.rel);
  if (rows.length === 0) return [EMPTY];
  switch (args.as ?? "table") {
    case "table": {
      const columns = list(args.columns ?? defaults.columns).map(labelledColumn);
      return tableLines(
        columns.map((c) => columnLabel(c, context.index)),
        rows.map((row) => columns.map((c) => cellText(row, c, context.index, dir))),
      );
    }
    case "list":
      return rows.map((row) => `- ${formatRow(row, args.format ?? defaults.format, context, dir)}`);
    case "ids":
      return [rows.map((row) => formatRow(row, "{id}", context, dir)).join(", ")];
    default:
      throw new TroveError(`as=${args.as}: use table, list or ids`);
  }
};

const grouped = (
  rows: ReportRow[],
  args: Readonly<Record<string, string>>,
  defaults: (typeof DEFAULTS)[keyof typeof DEFAULTS],
  context: ViewContext,
): string[] => {
  const sorted = sortRows(rows, list(args.sort ?? defaults.sort), context.index);
  if (!args.group) return layout(sorted, args, defaults, context);
  const dir = posix.dirname(context.rel);
  return groupRows(sorted, { groupBy: args.group, groupOrder: [] }, context.index).flatMap(
    ({ name, members }, i) => [
      ...(i > 0 ? [""] : []),
      `**${groupTitle(name, args.group ?? "", dir) || EMPTY}**`,
      "",
      ...layout(members, args, defaults, context),
    ],
  );
};

const VIEWS: Readonly<
  Record<string, (args: Readonly<Record<string, string>>, context: ViewContext) => string[]>
> = {
  items: (args, context) =>
    grouped(
      selectItems(context.index, filtersOf(args, context.base)),
      args,
      DEFAULTS.items,
      context,
    ),
  documents: (args, context) =>
    grouped(
      selectDocuments(context.index, filtersOf(args, context.base)).filter(
        (doc) => doc.rel !== context.rel,
      ),
      args,
      DEFAULTS.documents,
      context,
    ),
  progress: (args, context) =>
    grouped(
      selectDocuments(context.index, filtersOf(args, context.base)).filter(
        (doc) => doc.stages.length > 0 && doc.rel !== context.rel,
      ),
      args,
      DEFAULTS.progress,
      context,
    ),
  counts: (args, context) =>
    renderCounts(
      selectItems(context.index, filtersOf(args, context.base)),
      args.by ?? "priority",
      context.index,
      { label: args.label, outputDir: posix.dirname(context.rel) },
    ),
  placement: (_, context) => [placementTable(context.index.config)],
};

export const VIEW_NAMES = Object.keys(VIEWS);

export const renderView = (
  view: string,
  args: Readonly<Record<string, string>>,
  context: ViewContext,
): string => {
  const render = VIEWS[view];
  if (!render) throw new TroveError(`unknown block trove:${view}; one of ${VIEW_NAMES.join(", ")}`);
  return render(args, context).join("\n");
};
