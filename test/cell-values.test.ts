import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Item } from "../src/core/document/ledger.ts";
import { renderChangeCounts } from "../src/core/live/change-counts.ts";
import { changeLabels } from "../src/core/live/changes.ts";
import { renderTrend } from "../src/core/live/trend.ts";
import { groupRows, renderCounts } from "../src/core/reports/section.ts";
import { itemEnum } from "../src/core/rules/builtin/ledger.ts";
import { indexDocuments, openStore, parseDocument, runRules, selectItems } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const SANDBOX = join(ROOT, "sandbox");
const sandbox = await openStore({ cwd: SANDBOX, store: SANDBOX, today: TODAY });
const ledger = sandbox.config.ledger;
if (!ledger) throw new Error("the sandbox has a store ledger");
const config = {
  ...sandbox.config,
  ledger: {
    ...ledger,
    columns: ledger.columns.map((column) =>
      column.key === "owner" ? { ...column, multiple: true } : column,
    ),
  },
};

const header = (fields: string) => `---\n${fields}\nstatus: open\ndate: ${TODAY}\n---\n\n# X\n\n`;
const table = (rows: readonly string[]) =>
  [
    "<!-- ledger -->",
    "| id | P | owner | status | what is left |",
    "| -- | - | ----- | ------ | ------------ |",
    ...rows,
    "<!-- /ledger -->",
    "",
  ].join("\n");

const audit = `${header("type: audit\nslug: X1")}${table([
  "| X1-1 | P1 | web, api | open | Both teams |",
  "| X1-2 | P2 | web | open | Web only |",
  "| X1-3 | P2 | — | open | Nobody yet |",
  "| X1-4 | P3 | web, desktop | open | Outside the vocabulary |",
])}`;
const resolved = `${header("type: resolved\nbase: AUDIT_X_1.md")}${table([
  "| X1-9 | — | – | fixed | Closed long ago |",
])}`;

const docs = [
  ["audits/AUDIT_X_1.md", audit],
  ["audits/AUDIT_X_1.RESOLVED.md", resolved],
].map(([rel = "", text = ""]) => parseDocument({ path: rel, rel, text }, config));
const index = indexDocuments(SANDBOX, config, docs, TODAY);
const ids = (items: readonly Item[]) => items.map((item) => item.id);

describe("ledger cells", () => {
  test("item-enum checks each value and skips placeholders", () => {
    expect(runRules([itemEnum], index).map((d) => d.message)).toEqual([
      "owner of X1-4 is outside the vocabulary: desktop",
    ]);
  });

  test("without multiple, a cell is one value", () => {
    const single = parseDocument(
      { path: "x", rel: "audits/AUDIT_X_1.md", text: audit },
      sandbox.config,
    );
    const plain = indexDocuments(SANDBOX, sandbox.config, [single], TODAY);
    expect(runRules([itemEnum], plain).map((d) => d.message)).toEqual([
      "owner of X1-1 is outside the vocabulary: web, api",
      "owner of X1-4 is outside the vocabulary: web, desktop",
    ]);
  });

  test("a filter matches one of several values; a negation excludes the item", () => {
    expect(ids(selectItems(index, { owner: ["api"] }))).toEqual(["X1-1"]);
    expect(ids(selectItems(index, { owner: ["web"] }))).toEqual(["X1-1", "X1-2", "X1-4"]);
    expect(ids(selectItems(index, { owner: ["!api"] }))).toEqual(["X1-2", "X1-3", "X1-4"]);
  });

  test("a placeholder reads as an empty field", () => {
    expect(ids(selectItems(index, { owner: [""] }))).toEqual(["X1-3"]);
    expect(ids(selectItems(index, { state: ["closed"], priority: [""] }))).toEqual(["X1-9"]);
  });

  test("groups and counts take an item under each of its values", () => {
    const open = selectItems(index, {});
    const groups = groupRows(open, { groupBy: "owner", groupOrder: [] }, index);
    expect(groups.map(({ name, members }) => [name, ids(members as Item[])])).toEqual([
      ["", ["X1-3"]],
      ["api", ["X1-1"]],
      ["desktop", ["X1-4"]],
      ["web", ["X1-1", "X1-2", "X1-4"]],
    ]);
    const counts = renderCounts(open, "owner", index, { outputDir: "" });
    expect(counts).toContain("| web | 3 |");
    expect(counts).toContain("| — | 1 |");
    const [closed = ""] = changeLabels(config);
    const changed = open.map((item) => ({ ...item, values: { ...item.values, change: closed } }));
    expect(renderChangeCounts(changed, index, { by: "owner", outputDir: "" })).toContain(
      `| api | 1 |`,
    );
  });

  test("trend counts an item under each of its values", () => {
    const history = {
      starts: ["2026-10-12"],
      snapshots: [index.items.filter((item) => item.id !== "X1-1")],
      closedIn: [new Set<string>()],
    };
    const lines = renderTrend(history, index, {
      by: "owner",
      fallback: undefined,
      label: undefined,
      matches: () => true,
      outputDir: "",
    });
    expect(lines).toContain("| 2026-10-12 | api | 1 | 0 | 0 | 1 |");
    expect(lines).toContain("| 2026-10-12 | web | 1 | 0 | 0 | 3 |");
    expect(lines).toContain("| 2026-10-12 | — | 0 | 0 | 0 | 1 |");
  });
});
