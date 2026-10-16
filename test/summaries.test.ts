import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseFilters } from "../src/cli/args.ts";
import { fieldMatches } from "../src/core/index/match.ts";
import { queryRows } from "../src/core/index/rows.ts";
import { refreshPlan } from "../src/core/ops/refresh.ts";
import { carryWritten } from "../src/core/summaries/carry.ts";
import { newSummary, showSummary } from "../src/core/summaries/summaries.ts";
import { emptyWritePlaces } from "../src/core/summaries/write-places.ts";
import { openStore, parseConfig } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const SANDBOX = join(ROOT, "sandbox");
const store = await openStore({ cwd: SANDBOX, store: SANDBOX, today: TODAY });

describe("filters", () => {
  const vocabulary = { open: "открыто" };

  test("exact by raw text or vocabulary key, substring, glob, negation", () => {
    expect(fieldMatches("открыто", vocabulary, ["open"])).toBe(true);
    expect(fieldMatches("web/composer + Drafts", undefined, ["~COMPOSER"])).toBe(true);
    expect(fieldMatches("audits/mobile/AUDIT_MOBILE_1.md", undefined, ["audits/mobile/**"])).toBe(
      true,
    );
    expect(fieldMatches("audits/mobile/AUDIT_MOBILE_1.md", undefined, ["!audits/mobile/**"])).toBe(
      false,
    );
    expect(fieldMatches("audits/AUDIT_WEB_1.md", undefined, ["!audits/mobile/**"])).toBe(true);
  });

  test("a missing field passes only negations", () => {
    expect(fieldMatches(undefined, undefined, ["x"])).toBe(false);
    expect(fieldMatches(undefined, undefined, ["!x"])).toBe(true);
  });

  test("repeated CLI filters add up", () => {
    expect(parseFilters(["owner=web", "owner=!api", "path=a,b"])).toEqual({
      owner: ["web", "!api"],
      path: ["a", "b"],
    });
  });

  test("items filter on their document's fields too", () => {
    const { rows } = queryRows(
      store.index,
      "items",
      { path: ["!audits/AUDIT_WEB_1.md"], status: ["open"], type: ["audit"] },
      ["id"],
    );
    expect(rows.map((row) => row.id)).toEqual([
      "API2-1",
      "API2-2",
      "API2-3",
      "API2-4",
      "MOB1-1",
      "MOB1-2",
    ]);
  });
});

describe("summaries", () => {
  test("a kind with a template renders its own blocks", async () => {
    const text = await showSummary(store.index, { kind: "web" });
    expect(text).toContain("# Web client — what is left (2026-10-15)");
    expect(text).toContain("kind: web");
    expect(text).toContain("| WEB1-1 | P1 | composer |");
    expect(text).not.toContain("API2-1");
    expect(text).toContain("<!-- write: one paragraph");
  });

  test("a kind's filter and the caller's add up in the filter header", async () => {
    const text = await showSummary(store.index, {
      kind: "outside-web",
      filters: { owner: ["!mobile"] },
    });
    expect(text).toContain("filter: path=!audits/AUDIT_WEB_1.md owner=!mobile\n");
    expect(text).toContain("| API2-1 | P0 |");
    expect(text).not.toContain("MOB1-1");
    expect(text).not.toContain("WEB1-1");
  });

  test("without a kind, the built-in layout and only the given filters", async () => {
    const text = await showSummary(store.index, { title: "Not web", filters: { owner: ["!web"] } });
    expect(text).toContain("# Not web (2026-10-15)");
    expect(text).toContain("| P0 | 1 |");
    expect(text).toContain("**[AUDIT_API_2](audits/AUDIT_API_2.md)**");
    expect(text).not.toContain("| WEB1-1 |");
  });

  test("a new summary is a dated document of the summary type", async () => {
    const plan = await newSummary(store.index, { kind: "outside-web", keep: true });
    expect(plan.changes.map((change) => change.rel)).toEqual([
      "summaries/SUMMARY_OUTSIDE_WEB_2026-10-15.md",
    ]);
    expect(plan.changes[0]?.text).toContain("type: summary\nstatus: current");
    expect(plan.changes[0]?.text).toContain("](../audits/AUDIT_API_2.md)");
  });

  test("a new summary archives the one it replaces, which names it", async () => {
    const plan = await newSummary(store.index, { kind: "outside-web" });
    expect(plan.changes.map((change) => change.rel)).toEqual([
      "summaries/SUMMARY_OUTSIDE_WEB_2026-10-15.md",
      ".archive/summaries/SUMMARY_OUTSIDE_WEB.md",
    ]);
    const archived = plan.changes[1]?.text ?? "";
    expect(archived).toContain("status: archived\n");
    expect(archived).toContain("superseded_by: SUMMARY_OUTSIDE_WEB_2026-10-15.md\n");
    expect(plan.changes[1]?.from).toBe("summaries/SUMMARY_OUTSIDE_WEB.md");
  });

  test("--from latest carries the written analysis over and refills the blocks", async () => {
    const plan = await newSummary(store.index, { kind: "outside-web", from: "latest", keep: true });
    const text = plan.changes[0]?.text ?? "";
    expect(text).toContain("Look first at API2-1: a refresh token that survives logout");
    expect(text).toContain(`date: ${TODAY}\n`);
    expect(text).toContain("](../audits/AUDIT_API_2.md)");
    expect(text.match(/^\*\*Status:\*\*/gm)).toHaveLength(1);
    await expect(newSummary(store.index, { kind: "outside-web", from: "NOPE" })).rejects.toThrow(
      /no summary to start from: NOPE/,
    );
  });

  test("an unknown kind or a taken name is refused", async () => {
    await expect(newSummary(store.index, { kind: "nope" })).rejects.toThrow(
      /known: web, outside-web/,
    );
    await expect(newSummary(store.index, { kind: "web", name: "WEB" })).rejects.toThrow(
      /already exists/,
    );
  });

  test("a kind needs a known document type", () => {
    const base = `regulation: 1\nstatuses: { open: open, archived: archived }\n`;
    expect(() =>
      parseConfig(`${base}types: { note: {} }\nsummaries: { x: { title: X } }`, "inline"),
    ).toThrow(/summaries\.x\.type/);
  });
});

describe("refresh", () => {
  test("refills a named summary even past its date, never an archived document", async () => {
    const later = await openStore({ cwd: SANDBOX, store: SANDBOX, today: "2099-01-01" });
    const summary = later.index.byName.get("SUMMARY_WEB.md");
    if (!summary) throw new Error("the sandbox has a web summary");
    const broken = { ...summary, text: summary.text.replace("| WEB1-1 |", "| WEB1-0 |") };
    const plan = await refreshPlan(later.index, [broken]);
    expect(plan.changes.map((change) => change.rel)).toEqual(["summaries/SUMMARY_WEB.md"]);
    expect(plan.changes[0]?.text).toContain("| WEB1-1 |");
    expect((await refreshPlan(later.index, [])).changes).toEqual([]);

    const archived = later.index.documents.find((doc) => doc.place === "archive");
    if (!archived) throw new Error("the sandbox has an archive");
    await expect(refreshPlan(later.index, [archived])).rejects.toThrow(/is archived/);
  });
});

describe("carrying a summary over", () => {
  test("the template keeps its structure; written places come from the previous summary", () => {
    const template = [
      "<!-- write: intro -->",
      "",
      "## Counts",
      "",
      "<!-- trove:counts by=priority -->",
      "<!-- /trove:counts -->",
      "",
      "<!-- write: what to look at first -->",
      "",
      "## New section",
      "",
      "<!-- trove:items status=deferred -->",
      "<!-- /trove:items -->",
      "",
      "<!-- write: not verified yet -->",
    ].join("\n");
    const previous = [
      "The intro as written.",
      "",
      "## Counts",
      "",
      "<!-- trove:counts by=priority -->",
      "| P | count |",
      "<!-- /trove:counts -->",
      "",
      "Look at API2-1 first.",
      "",
      "## Old section",
      "",
      "Gone from the template.",
    ].join("\n");
    const carried = carryWritten(template, previous);
    expect(carried).toStartWith("<!-- write: intro -->\nThe intro as written.\n\n## Counts");
    expect(carried).toContain(
      "<!-- /trove:counts -->\n\n<!-- write: what to look at first -->\nLook at API2-1 first.\n\n## New section",
    );
    expect(carried).toContain("<!-- trove:items status=deferred -->");
    expect(carried).toEndWith("<!-- write: not verified yet -->");
    expect(carried).not.toContain("Gone from the template.");
    expect(carried).not.toContain("| P | count |");
  });

  test("a place is found by its label first, even when a new block now sits above it", () => {
    const template = [
      "## Notes",
      "",
      "<!-- trove:changes -->",
      "<!-- /trove:changes -->",
      "",
      "<!-- write: what changed -->",
      "",
      "## Risks",
      "",
      "<!-- trove:items -->",
      "<!-- /trove:items -->",
      "",
      "<!-- write: the risks -->",
    ].join("\n");
    const labelled = [
      "## Notes",
      "",
      "<!-- write: what changed -->",
      "Two items closed.",
      "",
      "## Risks",
      "",
      "<!-- write: the risks -->",
      "Backups untested.",
    ].join("\n");
    const carried = carryWritten(template, labelled);
    expect(carried).toContain("<!-- write: what changed -->\nTwo items closed.\n\n## Risks");
    expect(carried).toEndWith("<!-- write: the risks -->\nBackups untested.");
    const unlabelled = ["## Notes", "", "Two items closed.", "", "## New", "", "Kept."].join("\n");
    const fallback = carryWritten(template, unlabelled);
    expect(fallback).toContain("<!-- write: what changed -->\nTwo items closed.\n\n## Risks");
    expect(fallback).toEndWith("<!-- write: the risks -->");
  });

  test("a place counts as written once text sits under its label", () => {
    const lines = [
      "<!-- write: intro -->",
      "Written.",
      "<!-- write: next -->",
      "",
      "## Heading",
      "<!-- write: last -->",
    ];
    expect(emptyWritePlaces(lines)).toEqual([2, 5]);
  });
});
