import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan } from "../src/core/ops/apply.ts";
import { retypePlan } from "../src/core/ops/doc-retype.ts";
import { requireDocument } from "../src/core/ops/find.ts";
import { regulation } from "../src/core/regulation/regulation.ts";
import { fillEmbeds } from "../src/core/reports/embeds.ts";
import { openStore, runRules, type Store, writeReports } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<Store> => {
  const root = await mkdtemp(join(tmpdir(), "trove-placement-"));
  copies.push(root);
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  return openStore({ cwd: root, store: root, today: TODAY });
};

const read = (store: Store, rel: string) => Bun.file(join(store.root, rel)).text();

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

describe("placement", () => {
  test("the regulation lists every type with where it lives and what belongs there", async () => {
    const store = await sandbox();
    const text = regulation(store.config, store.rules, "placement");
    expect(text).toContain(
      "| `research` | `research/RESEARCH_` | The report of a finished investigation",
    );
    expect(text).toContain("| `debt` | `store root` |");
  });

  test("embedded tables are rebuilt from the config, keeping line breaks and unknown blocks", async () => {
    const store = await sandbox();
    const text =
      "intro\r\n<!-- regulation:placement -->\r\nstale\r\n<!-- /regulation:placement -->\r\n<!-- regulation:other -->\r\nkeep\r\n<!-- /regulation:other -->\r\n";
    const filled = fillEmbeds(text, store.config);
    expect(filled).toContain("| `plan` | `plans/PLAN_` |");
    expect(filled).not.toContain("stale");
    expect(filled).toContain("<!-- regulation:other -->\r\nkeep\r\n");
    expect(filled.split("\r\n").length).toBe(filled.split("\n").length);
  });

  test("a changed purpose reaches AGENTS.md with the next report", async () => {
    const store = await sandbox();
    const config = Bun.file(join(store.root, "trove.yaml"));
    await Bun.write(
      config,
      (await config.text()).replace("The report of a finished investigation", "What we learned"),
    );
    const reopened = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    const results = await writeReports(reopened.index, Object.keys(reopened.config.reports));
    expect(results.find((result) => result.output === "AGENTS.md")?.changed).toBe(true);
    expect(await read(store, "AGENTS.md")).toContain("What we learned");
  });
});

describe("doc retype", () => {
  test("research that became a plan of work moves to plans/ with its links and title", async () => {
    const store = await sandbox();
    const plan = retypePlan(
      store.index,
      requireDocument(store.index, "RESEARCH_DB_INDEXES"),
      "plan",
    );
    expect((await applyPlan(store, plan)).introduced).toEqual([]);

    const moved = await read(store, "plans/PLAN_DB_INDEXES.md");
    expect(moved).toContain("type: plan\n");
    expect(moved).toContain("# PLAN_DB_INDEXES — which indexes");
    expect(await Bun.file(join(store.root, "research/RESEARCH_DB_INDEXES.md")).exists()).toBe(
      false,
    );
    expect(await read(store, "BACKLOG.md")).toContain(
      "[PLAN_DB_INDEXES](plans/PLAN_DB_INDEXES.md)",
    );
  });

  test("references by name follow the renamed file", async () => {
    const store = await sandbox();
    const plan = retypePlan(store.index, requireDocument(store.index, "SPEC_SEARCH_V2"), "plan");
    expect((await applyPlan(store, plan)).introduced).toEqual([]);
    expect(await read(store, ".archive/specs/SPEC_SEARCH.md")).toContain(
      "superseded_by: PLAN_SEARCH_V2.md",
    );
    const reopened = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    expect(runRules(reopened.rules, reopened.index).filter((d) => d.severity === "error")).toEqual(
      [],
    );
  });

  test("a status the new type does not allow starts over at the type's initial one", async () => {
    const store = await sandbox();
    const config = Bun.file(join(store.root, "trove.yaml"));
    await Bun.write(
      config,
      (await config.text()).replace(
        "capabilities: [status-line, freshness], initial: not-started }",
        "capabilities: [status-line, freshness], initial: not-started, statuses: [not-started, in-progress, closed, archived] }",
      ),
    );
    const reopened = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    const plan = retypePlan(
      reopened.index,
      requireDocument(reopened.index, "RESEARCH_DB_INDEXES"),
      "plan",
    );
    expect((await applyPlan(reopened, plan)).introduced).toEqual([]);
    const moved = await read(store, "plans/PLAN_DB_INDEXES.md");
    expect(moved).toContain("status: not started\n");
    expect(moved).toContain("**Status:** not started.");
  });

  test("refuses the same type and unknown types", async () => {
    const store = await sandbox();
    const doc = requireDocument(store.index, "PLAN_OFFLINE_MODE");
    expect(() => retypePlan(store.index, doc, "plan")).toThrow(/already plan/);
    expect(() => retypePlan(store.index, doc, "memo")).toThrow(/unknown type/);
  });
});
