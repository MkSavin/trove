import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { queryRows } from "../src/core/index/rows.ts";
import { compareNatural } from "../src/core/text/compare.ts";
import { openStore, resolveRef, sectionText, selectDocuments, selectItems } from "../src/index.ts";
import { openFixture, ROOT, TODAY } from "./helpers.ts";

const { index } = await openFixture();
const SANDBOX = join(ROOT, "sandbox");
const store = await openStore({ cwd: SANDBOX, store: SANDBOX, today: TODAY });

describe("selectItems", () => {
  test("matches a vocabulary field by key or by label", () => {
    const byKey = selectItems(index, { status: ["deferred"] }).map((item) => item.id);
    const byLabel = selectItems(index, { status: ["отложено"] }).map((item) => item.id);
    expect(byKey).toEqual(["DONE1-1", "GOOD1-1"]);
    expect(byLabel).toEqual(byKey);
  });

  test("reads ledgers with and without the module column", () => {
    const [server] = selectItems(index, { owner: ["backend"] });
    expect(server?.values).toEqual({
      id: "GOOD1-3",
      priority: "P0",
      owner: "backend",
      status: "открыто",
      what: "Server item without a module column",
    });
  });
});

describe("queryRows", () => {
  test("shows only the columns of the ledgers the matched items come from", () => {
    const audits = queryRows(store.index, "items", { type: ["audit"] });
    expect(audits.fields).toEqual([
      "id",
      "priority",
      "module",
      "owner",
      "status",
      "what",
      "document",
    ]);
    expect(audits.rows[0]).not.toHaveProperty("plan");

    const debt = queryRows(store.index, "items", { type: ["debt"] });
    expect(debt.fields).toEqual(["id", "status", "what", "plan", "document"]);

    const both = queryRows(store.index, "items", { type: ["audit", "debt"] });
    expect(both.fields).toEqual([
      "id",
      "priority",
      "module",
      "owner",
      "status",
      "what",
      "plan",
      "document",
    ]);
  });

  test("keeps the requested columns as given", () => {
    const { fields, rows } = queryRows(store.index, "items", { type: ["debt"] }, ["what", "id"]);
    expect(fields).toEqual(["what", "id"]);
    expect(Object.keys(rows[0] ?? {})).toEqual(["what", "id"]);
  });
});

describe("selectDocuments", () => {
  test("filters by type, place and staleness", () => {
    const plans = selectDocuments(index, { type: ["plan"], place: ["work"] }).map((d) => d.name);
    expect(plans).toEqual(["PLAN_ARCHIVED_HERE.md", "PLAN_NO_STATUS_LINE.md"]);
    expect(selectDocuments(index, { stale: ["true"] }).map((d) => d.rel)).toEqual(["DEBT.md"]);
  });
});

describe("resolveRef", () => {
  test("finds an item's own section, ignoring fenced lookalikes and longer ids", () => {
    const resolved = resolveRef(index, "GOOD1-2");
    expect(resolved?.kind).toBe("item");
    if (resolved?.kind !== "item" || !resolved.heading) throw new Error("no heading");
    expect(sectionText(resolved.document, resolved.heading)).toBe(
      "### GOOD1-2. Second item\n\nBody of the second item.",
    );
  });

  test("finds DOCUMENT#heading by case-insensitive substring", () => {
    const resolved = resolveRef(index, "AUDIT_GOOD_1#реестр");
    expect(resolved?.kind === "section" && resolved.heading.line).toBe(16);
  });

  test("returns the document for a bare name and nothing for unknown refs", () => {
    expect(resolveRef(index, "DEBT")?.kind).toBe("document");
    expect(resolveRef(index, "NOPE-1")).toBeUndefined();
  });
});

describe("compareNatural", () => {
  test("orders trailing numbers numerically", () => {
    expect(["A-10", "A-2", "A-1", "B-1"].sort(compareNatural)).toEqual([
      "A-1",
      "A-2",
      "A-10",
      "B-1",
    ]);
  });
});
