import { z } from "zod";

const oneOrMany = <T extends z.ZodType>(item: T) =>
  z.union([item, z.array(item)]).transform((value) => (Array.isArray(value) ? value : [value]));

export const CAPABILITIES = [
  "ledger",
  "series",
  "versions",
  "prompt-body",
  "resolved-of",
  "status-line",
  "freshness",
  "generated",
  "stages",
] as const;

export const SEVERITIES = ["error", "warn", "info", "off"] as const;

const severity = z.enum(SEVERITIES);

const field = z.union([
  z.enum(["required", "optional"]).transform((value) => ({
    required: value === "required",
    format: "text" as const,
  })),
  z.strictObject({
    required: z.boolean().default(false),
    format: z.enum(["text", "date", "refs"]).default("text"),
  }),
]);

const fields = z.record(z.string(), field).default({});

const folder = z.strictObject({
  prefix: oneOrMany(z.string()),
  types: z.array(z.string()).min(1),
});

const enumeration = z
  .union([z.array(z.string()), z.record(z.string(), z.string())])
  .transform((value) =>
    Array.isArray(value) ? Object.fromEntries(value.map((key) => [key, key])) : value,
  );

const ledgerColumn = z.strictObject({
  key: z.string(),
  label: z.string(),
  required: z.boolean().default(false),
  enum: enumeration.optional(),
  /** Cells hold comma-separated values, e.g. `web, api`; filters and groups take each one. */
  multiple: z.boolean().default(false),
});

const PLACEHOLDER = /\{\w+\}/;

const closedOutcomes = z
  .union([z.string(), z.record(z.string(), z.string())])
  .transform((value) => (typeof value === "string" ? { closed: value } : value))
  .refine((outcomes) => !Object.values(outcomes).some((label) => PLACEHOLDER.test(label)), {
    message: "closed labels take no placeholders: put {date} and {commit} into note",
  });

const ledger = z.strictObject({
  marker: z.string().default("ledger"),
  /** `{field}` reads the document header, `{section}` the table's code in `sections`, `{n}` counts. */
  id: z.string().default("{slug}-{n}"),
  /** Heading a table sits under → its id code, e.g. `{ Server: S }` for `DEBT-S1`. */
  sections: z.record(z.string(), z.string()).optional(),
  columns: z.array(ledgerColumn).min(1),
  /** Item status keys that keep a document out of the archive. */
  open: z.array(z.string()).default(["open"]),
  /** Ways an item gets closed, key → label, e.g. `{ fixed: fixed, dropped: dropped }`; the first is the default. */
  closed: closedOutcomes.default({ closed: "closed" }),
  /** Heading note of a closed item; `{status}` is the outcome label, `{date}` and `{commit}` optional. */
  note: z.string().default("{status}, {commit}"),
  /** Heading of a new item's section; `{status}` and any column key. */
  heading: z.string().default("{id}. {what} ({status})"),
  /** Lines put under a new item's heading, with the same placeholders. */
  stub: z.string().optional(),
});

const documentType = z.strictObject({
  /** What belongs in this type and what does not; the placement regulation is built from it. */
  purpose: z.string().optional(),
  capabilities: z.array(z.enum(CAPABILITIES)).default([]),
  /** Status keys this type may carry; any known status when omitted. */
  statuses: z.array(z.string()).optional(),
  /** Status key of a new document; the first allowed status when omitted. */
  initial: z.string().optional(),
  fields,
  freshness: z.int().positive().optional(),
  /** Its own ledger columns and statuses, e.g. for a debt list; the store's ledger otherwise. */
  ledger: ledger.optional(),
  /** A `resolved-of` type: `item close` moves closed items into this document's companion of it. */
  closeInto: z.string().optional(),
});

const lifecycleStep = z.strictObject({
  when: z.union([
    z.enum(["no-open-items", "has-open-items"]),
    z.strictObject({ status: z.string() }),
  ]),
  place: z.enum(["archive", "work"]),
});

const ruleSetting = z.union([
  severity.transform((level) => ({
    level,
    since: undefined,
    limit: undefined,
    commits: undefined,
  })),
  z.strictObject({
    level: severity,
    since: z.iso.date().optional(),
    /** A size or count the rule measures against, e.g. bytes for `item-size`. */
    limit: z.int().positive().optional(),
    /** A number of commits, for `stale-check`. */
    commits: z.int().positive().optional(),
  }),
]);

const reportColumn = z.union([
  z.string().transform((key) => ({ key, label: undefined, empty: undefined })),
  z.strictObject({ key: z.string(), label: z.string().optional(), empty: z.string().optional() }),
]);

const reportSection = z.strictObject({
  title: z.string().optional(),
  from: z.enum(["items", "documents"]),
  where: z.record(z.string(), oneOrMany(z.string())).default({}),
  groupBy: z.string().optional(),
  groupOrder: z.array(z.string()).default([]),
  sort: z.array(z.string()).default([]),
  /** Counts rows per value of this field instead of listing them. */
  count: z.string().optional(),
  columns: z.array(reportColumn).default([]),
});

const filters = z.record(z.string(), oneOrMany(z.string()));

/** A kind of summary: documents created from one template under one base filter. */
const summary = z.strictObject({
  title: z.string(),
  type: z.string().default("summary"),
  scope: z.string().optional(),
  filter: filters.default({}),
  /** Store-relative template; the built-in layout when omitted. */
  template: z.string().optional(),
});

const report = z.strictObject({
  output: z.string(),
  type: z.string(),
  status: z.string(),
  title: z.string(),
  scope: z.string(),
  note: z.string(),
  intro: z.string().optional(),
  sections: z.array(reportSection).min(1),
});

const STAGE_STATUS = ["status", "state", "статус", "состояние"];

const STAGE_DONE = [
  "done",
  "merged",
  "closed",
  "complete",
  "completed",
  "finished",
  "shipped",
  "released",
  "✓",
  "✔",
  "✅",
  "готов",
  "готово",
  "сделан",
  "сделано",
  "выполнен",
  "выполнено",
  "реализован",
  "реализовано",
  "завершён",
  "завершен",
  "завершено",
  "влит",
  "влито",
  "слит",
  "слито",
  "в master",
  "в main",
  "закрыт",
  "закрыто",
];

/** How a plan's stages are read: status column headers of a stage table, and values meaning done. */
const stages = z.strictObject({
  status: z.array(z.string()).default(STAGE_STATUS),
  done: z.array(z.string()).default(STAGE_DONE),
});

/** A code repository next to the store; with `ref`, links are checked against that commit. */
const codeRoot = z.union([
  z.string().transform((path) => ({ path, ref: undefined })),
  z.strictObject({ path: z.string(), ref: z.string().optional() }),
]);

export const configSchema = z.strictObject({
  regulation: z.literal(1),
  language: z.string().default("en"),
  sync: z.enum(["off", "commit", "push"]).default("off"),
  roots: z.record(z.string(), codeRoot).default({}),
  folders: z.record(z.string(), folder).default({}),
  archive: z
    .strictObject({
      folder: z.string(),
      /** Set by `doc archive`. */
      status: z.string(),
      /** Other statuses a document may keep in the archive, e.g. `done` or `dropped`. */
      finished: z.array(z.string()).default([]),
    })
    .default({ folder: ".archive", status: "archived", finished: [] }),
  /** File names that are not documents, matched anywhere in the store. */
  ignore: z.array(z.string()).default(["AGENTS.md", "README.md"]),
  /** Files whose `<!-- regulation:<topic> -->` blocks are rebuilt with the reports. */
  regulationFiles: z.array(z.string()).default(["AGENTS.md"]),
  statuses: z.record(z.string(), z.string()),
  labels: z
    .strictObject({
      statusLine: z.string().default("Status"),
      checked: z.string().default("Checked"),
      ledger: z.string().default("Ledger"),
      closedLedger: z.string().default("Closed items"),
      count: z.string().default("count"),
      summaryCounts: z.string().default("By priority"),
      summaryItems: z.string().default("Open items"),
      summaryDeferred: z.string().default("Deferred work"),
      summaryDocuments: z.string().default("Documents in work"),
      branch: z.string().default("branch"),
      lastCommit: z.string().default("last commit"),
      ownCommits: z.string().default("own"),
      localAhead: z.string().default("local ahead"),
      localDiverged: z.string().default("local diverged"),
      change: z.string().default("change"),
      changeClosed: z.string().default("closed"),
      changeAdded: z.string().default("added"),
      changeMoved: z.string().default("moved"),
      noChanges: z.string().default("no changes"),
      baseMoved: z
        .string()
        .default("base moved to {commit} {date}: the store did not exist on {since}"),
      week: z.string().default("week"),
      trendOpened: z.string().default("opened"),
      trendClosed: z.string().default("closed"),
      trendMoved: z.string().default("moved"),
      trendOpen: z.string().default("open at end"),
      trendStart: z.string().default("at start"),
    })
    .default({
      statusLine: "Status",
      checked: "Checked",
      ledger: "Ledger",
      closedLedger: "Closed items",
      count: "count",
      summaryCounts: "By priority",
      summaryItems: "Open items",
      summaryDeferred: "Deferred work",
      summaryDocuments: "Documents in work",
      branch: "branch",
      lastCommit: "last commit",
      ownCommits: "own",
      localAhead: "local ahead",
      localDiverged: "local diverged",
      change: "change",
      changeClosed: "closed",
      changeAdded: "added",
      changeMoved: "moved",
      noChanges: "no changes",
      baseMoved: "base moved to {commit} {date}: the store did not exist on {since}",
      week: "week",
      trendOpened: "opened",
      trendClosed: "closed",
      trendMoved: "moved",
      trendOpen: "open at end",
      trendStart: "at start",
    }),
  fields,
  types: z.record(z.string(), documentType),
  ledger: ledger.optional(),
  lifecycle: z.record(z.string(), z.array(lifecycleStep)).default({}),
  freshness: z.strictObject({ default: z.int().positive() }).default({ default: 60 }),
  rules: z.record(z.string(), ruleSetting).default({}),
  reports: z.record(z.string(), report).default({}),
  plugins: z.string().optional(),
  /** Folder of `<type>.md` files that replace the built-in template of a new document. */
  templates: z.string().optional(),
  summaries: z.record(z.string(), summary).default({}),
  stages: stages.default({ status: STAGE_STATUS, done: STAGE_DONE }),
});

export type Config = z.output<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;
export type Capability = (typeof CAPABILITIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type FieldSpec = z.output<typeof field>;
export type DocumentTypeConfig = z.output<typeof documentType>;
export type LedgerConfig = z.output<typeof ledger>;
export type LedgerColumn = z.output<typeof ledgerColumn>;
export type LifecycleStep = z.output<typeof lifecycleStep>;
export type ReportConfig = z.output<typeof report>;
export type ReportSection = z.output<typeof reportSection>;
export type ReportColumn = z.output<typeof reportColumn>;
export type SummaryConfig = z.output<typeof summary>;
export type StagesConfig = z.output<typeof stages>;
