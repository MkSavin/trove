import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFilters } from "../src/cli/args.ts";
import { fieldMatches } from "../src/core/index/match.ts";
import { queryRows } from "../src/core/index/rows.ts";
import { refreshPlan } from "../src/core/ops/refresh.ts";
import { refreshGenerated } from "../src/core/reports/embeds.ts";
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

  test("a name that already carries the prefix is the whole file name", async () => {
    for (const name of ["SUMMARY_WEEKLY_2026-10-16-draft", "SUMMARY_WEEKLY_2026-10-16-draft.md"]) {
      const plan = await newSummary(store.index, { kind: "web", name, keep: true });
      expect(plan.changes[0]?.rel).toBe("summaries/SUMMARY_WEEKLY_2026-10-16-draft.md");
    }
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

describe("text copied into generated blocks", () => {
  test("relative links are rebased on the folder of the document that shows them", async () => {
    const root = await mkdtemp(join(tmpdir(), "trove-links-"));
    try {
      await cp(SANDBOX, root, { recursive: true });
      const edit = async (rel: string, from: string, to: string) => {
        const file = Bun.file(join(root, rel));
        await Bun.write(file, (await file.text()).replace(from, to));
      };
      await edit(
        "plans/PLAN_PUSH_RETRY.md",
        "Stage 1 merged,",
        "Stage 1 merged after [PLAN_OFFLINE_MODE](PLAN_OFFLINE_MODE.md#outbox), see [docs](https://example.com/a.md),",
      );
      await edit(
        "audits/AUDIT_API_2.md",
        "after logout on another device |",
        "after logout, see [plan](../plans/PLAN_OFFLINE_MODE.md) |",
      );
      const { index } = await openStore({ cwd: root, store: root, today: TODAY });
      const notes = refreshGenerated(
        '<!-- trove:documents type=plan as=list format="{document}: {note}" -->\n<!-- /trove:documents -->',
        "summaries/NOTES.md",
        index,
      );
      expect(notes).toContain("[PLAN_OFFLINE_MODE](../plans/PLAN_OFFLINE_MODE.md#outbox)");
      expect(notes).toContain("[docs](https://example.com/a.md)");
      const items = refreshGenerated(
        "<!-- trove:items owner=api columns=id,what -->\n<!-- /trove:items -->",
        "ITEMS.md",
        index,
      );
      expect(items).toContain("see [plan](plans/PLAN_OFFLINE_MODE.md) |");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

  test("text after a block follows its kind and place under its heading, not blocks above", () => {
    const template = [
      "## New",
      "",
      "<!-- trove:items status=deferred -->",
      "<!-- /trove:items -->",
      "",
      "<!-- write: -->",
      "",
      "## Urgent",
      "",
      "<!-- trove:items priority=P0,P1 -->",
      "<!-- /trove:items -->",
      "",
      "<!-- write: -->",
      "",
      "## Devops",
      "",
      "<!-- trove:items area=devops -->",
      "<!-- /trove:items -->",
      "",
      "<!-- write: -->",
      "",
      "## Moved",
      "",
      "<!-- trove:items area=web -->",
      "<!-- /trove:items -->",
      "",
      "<!-- write: -->",
    ].join("\n");
    const previous = [
      "## Urgent",
      "",
      "<!-- trove:items priority=P0,P1 -->",
      "| API2-1 |",
      "<!-- /trove:items -->",
      "",
      "Urgent notes.",
      "",
      "## Devops",
      "",
      "<!-- trove:items area=devops -->",
      "<!-- /trove:items -->",
      "",
      "Devops notes.",
      "",
      "## Moved",
      "",
      "Web notes under the heading.",
    ].join("\n");
    const carried = carryWritten(template, previous);
    expect(carried).toContain(
      "## New\n\n<!-- trove:items status=deferred -->\n<!-- /trove:items -->\n\n<!-- write: -->\n\n## Urgent",
    );
    expect(carried).toContain("<!-- write: -->\nUrgent notes.\n\n## Devops");
    expect(carried).toContain("<!-- write: -->\nDevops notes.\n\n## Moved");
    expect(carried).toEndWith("<!-- write: -->\nWeb notes under the heading.");
  });

  test("a block whose options changed keeps its text; same-kind blocks elsewhere do not shift it", () => {
    const template = [
      "## Specs",
      "",
      "<!-- trove:documents type=spec -->",
      "<!-- /trove:documents -->",
      "",
      "<!-- write: -->",
      "",
      "## Plans",
      "",
      '<!-- trove:documents type=plan format="{document} — {status}: {note}" owner=!ops -->',
      "<!-- /trove:documents -->",
      "",
      "<!-- write: -->",
      "",
      "<!-- trove:documents type=plan status=closed as=ids -->",
      "<!-- /trove:documents -->",
      "",
      "<!-- write: -->",
    ].join("\n");
    const previous = [
      "## Plans",
      "",
      '<!-- trove:documents type=plan format="{document} — {status}" -->',
      "- PLAN_ROLLOUT — current",
      "<!-- /trove:documents -->",
      "",
      "Rollout first.",
      "",
      "<!-- trove:documents type=plan status=closed -->",
      "<!-- /trove:documents -->",
      "",
      "Closed plans.",
    ].join("\n");
    const carried = carryWritten(template, previous);
    expect(carried).toContain("<!-- /trove:documents -->\n\n<!-- write: -->\n\n## Plans");
    expect(carried).toContain("<!-- write: -->\nRollout first.\n\n<!-- trove:documents type=plan");
    expect(carried).toEndWith("<!-- write: -->\nClosed plans.");
  });

  test("text after a block the template no longer has goes to a place of the same section", () => {
    const template = [
      "## Risks",
      "",
      "<!-- trove:counts type=risk -->",
      "<!-- /trove:counts -->",
      "",
      "<!-- write: -->",
      "",
      "## Later",
      "",
      "<!-- write: -->",
    ].join("\n");
    const previous = [
      "## Risks",
      "",
      "<!-- trove:items type=risk -->",
      "<!-- /trove:items -->",
      "",
      "Backups untested.",
      "",
      "## Later",
    ].join("\n");
    const carried = carryWritten(template, previous);
    expect(carried).toContain("<!-- write: -->\nBackups untested.\n\n## Later");
    expect(carried).toEndWith("## Later\n\n<!-- write: -->");
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
