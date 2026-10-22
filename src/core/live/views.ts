import { posix } from "node:path";
import type { Item } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import { mergeFilters } from "../index/filters.ts";
import type { StoreIndex } from "../index/index.ts";
import { type Filters, itemPasses, selectDocuments, selectItems } from "../index/query.ts";
import { placementTable } from "../regulation/regulation.ts";
import { cellText, columnLabel, groupTitle, type ReportRow } from "../reports/cells.ts";
import { groupRows, renderCounts, sortRows, tableLines } from "../reports/section.ts";
import { branchesKey, branchesRoot, renderBranches } from "./branches.ts";
import { renderChangeCounts } from "./change-counts.ts";
import { baseNote, changeLabels, changeRows, changesKey } from "./changes.ts";
import { loaded } from "./git-data.ts";
import { renderTrend, trendKey } from "./trend.ts";

/** Where a block lives and what it inherits: links are relative to it, filters add up. */
export type ViewContext = { index: StoreIndex; rel: string; base: Filters };

const LAYOUT_KEYS = new Set(["as", "columns", "group", "sort", "by", "label", "format"]);
const EMPTY = "—";
const PLACEHOLDER = /\{(\w+)\}/g;

type Layout = {
  columns: string;
  sort: string;
  format: string;
  /** Labels of columns that are not ledger columns. */
  labels?: Readonly<Record<string, string>>;
  /** Groups that come first, in this order, by the field grouped on. */
  groupOrder?: Readonly<Record<string, readonly string[]>>;
};

const DEFAULTS = {
  items: { columns: "id,priority,what", sort: "priority,id", format: "{id} — {what}" },
  changes: { columns: "change,id,what,document", sort: "", format: "{id} — {what} ({change})" },
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
} as const satisfies Record<string, Layout>;

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
  defaults: Layout,
  context: ViewContext,
): string[] => {
  const dir = posix.dirname(context.rel);
  if (rows.length === 0) return [EMPTY];
  switch (args.as ?? "table") {
    case "table": {
      const columns = list(args.columns ?? defaults.columns)
        .map(labelledColumn)
        .map((c) => ({ ...c, label: c.label ?? defaults.labels?.[c.key] }));
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

/** With `group`, a bold title per group above what `render` makes of its rows. */
const sections = <Row extends ReportRow>(
  rows: Row[],
  args: Readonly<Record<string, string>>,
  defaults: Pick<Layout, "groupOrder">,
  context: ViewContext,
  render: (members: Row[]) => string[],
): string[] => {
  if (!args.group) return render(rows);
  const dir = posix.dirname(context.rel);
  const groupOrder = [...(defaults.groupOrder?.[args.group] ?? [])];
  return groupRows(rows, { groupBy: args.group, groupOrder }, context.index).flatMap(
    ({ name, members }, i) => [
      ...(i > 0 ? [""] : []),
      `**${groupTitle(name, args.group ?? "", dir) || EMPTY}**`,
      "",
      ...render(members),
    ],
  );
};

const grouped = (
  rows: ReportRow[],
  args: Readonly<Record<string, string>>,
  defaults: Layout,
  context: ViewContext,
): string[] =>
  sections(
    sortRows(rows, list(args.sort ?? defaults.sort), context.index),
    args,
    defaults,
    context,
    (members) => layout(members, args, defaults, context),
  );

/** Lines of a block; nothing when the git data it needs was not read. */
type View = (args: Readonly<Record<string, string>>, context: ViewContext) => string[] | undefined;

const changes: View = (args, context) => {
  const baseline = loaded(context.index.gitData?.changes.get(changesKey(context.rel, args)));
  if (!baseline) return undefined;
  const { before, moved } = baseline.value;
  if (!before) return [EMPTY];
  const { since: _, ...rest } = args;
  const outputDir = posix.dirname(context.rel);
  const config = context.index.config;
  const rows = changeRows(
    context.index,
    baseline.value,
    itemPasses(context.index, filtersOf(rest, context.base)),
  );
  const note = moved ? [baseNote(config, moved), ""] : [];
  if (rows.length === 0) return [...note, config.labels.noChanges];
  const groupOrder = { change: changeLabels(config) };
  const counts = (members: Item[], by: string | undefined) =>
    renderChangeCounts(members, context.index, { by, label: rest.label, outputDir });
  // Counts alone grouped are a row per group; with `by` as well, a table per group.
  if (rest.as === "counts")
    return [
      ...note,
      ...(rest.by === undefined
        ? counts(rows, rest.group)
        : sections(rows, rest, { groupOrder }, context, (members) => counts(members, rest.by))),
    ];
  return [
    ...note,
    ...grouped(
      rows,
      rest,
      { ...DEFAULTS.changes, labels: { change: config.labels.change }, groupOrder },
      context,
    ),
  ];
};

const branches: View = (args, context) => {
  branchesRoot(context.index.config, args);
  const table = loaded(context.index.gitData?.branches.get(branchesKey(args)));
  return (
    table &&
    renderBranches(
      table.value,
      context.index.config,
      { merged: args.merged, active: args.active },
      context.index.today,
    )
  );
};

const trend: View = (args, context) => {
  const history = loaded(context.index.gitData?.trend.get(trendKey(args)));
  if (!history) return undefined;
  const { weeks: _, fallback, ...rest } = args;
  return renderTrend(history.value, context.index, {
    by: rest.by,
    fallback,
    label: rest.label,
    matches: itemPasses(context.index, filtersOf(rest, context.base)),
    outputDir: posix.dirname(context.rel),
  });
};

const VIEWS: Readonly<Record<string, View>> = {
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
  branches,
  changes,
  trend,
};

export const VIEW_NAMES = Object.keys(VIEWS);

export const renderView = (
  view: string,
  args: Readonly<Record<string, string>>,
  context: ViewContext,
): string | undefined => {
  const render = VIEWS[view];
  if (!render) throw new TroveError(`unknown block trove:${view}; one of ${VIEW_NAMES.join(", ")}`);
  return render(args, context)?.join("\n");
};
