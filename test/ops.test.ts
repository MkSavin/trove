import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan } from "../src/core/ops/apply.ts";
import { archivePlan } from "../src/core/ops/doc-archive.ts";
import { newDocument } from "../src/core/ops/doc-new.ts";
import { setDocumentField } from "../src/core/ops/doc-set.ts";
import { requireDocument } from "../src/core/ops/find.ts";
import { addItem } from "../src/core/ops/item-add.ts";
import { closedNote, closeItem } from "../src/core/ops/item-close.ts";
import { deferItem } from "../src/core/ops/item-defer.ts";
import { nameBase } from "../src/core/ops/naming.ts";
import type { Plan } from "../src/core/ops/plan.ts";
import { lineDiff } from "../src/core/text/diff.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<Store> => {
  const root = await mkdtemp(join(tmpdir(), "trove-ops-"));
  copies.push(root);
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  return openStore({ cwd: root, store: root, today: TODAY });
};

const read = (store: Store, rel: string) => Bun.file(join(store.root, rel)).text();
const reopen = (store: Store) => openStore({ cwd: store.root, store: store.root, today: TODAY });

const apply = async (store: Store, plan: Plan) => {
  const outcome = await applyPlan(store, plan);
  expect(outcome.introduced).toEqual([]);
  return outcome;
};

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

describe("closed note", () => {
  test("fills date and commit, and drops the commit part without one", () => {
    expect(closedNote("closed", "2026-10-15", "abc")).toBe("closed, abc");
    expect(closedNote("закрыто {date}, `{commit}`", "2026-10-15", "abc")).toBe(
      "закрыто 2026-10-15, `abc`",
    );
    expect(closedNote("закрыто {date}, `{commit}`", "2026-10-15", undefined)).toBe(
      "закрыто 2026-10-15",
    );
  });
});

describe("item close", () => {
  test("touches only the ledger row and the item's heading", async () => {
    const store = await sandbox();
    const before = await read(store, "audits/AUDIT_WEB_1.md");
    await apply(store, closeItem(store.index, "WEB1-3", { commit: "a1b2c3d" }));
    const diff = lineDiff(before, await read(store, "audits/AUDIT_WEB_1.md"));
    expect(diff.map((line) => `${line.kind}${line.text}`)).toEqual([
      "-| WEB1-3 | P2 | threads | web | open | Unread counter drifts after a reconnect: deltas are applied twice |",
      "-### WEB1-3. Unread counter drifts after a reconnect (open)",
      "+### WEB1-3. Unread counter drifts after a reconnect (closed, a1b2c3d)",
    ]);
  });

  test("rebuilds the backlog and points at other mentions", async () => {
    const store = await sandbox();
    const outcome = await apply(store, closeItem(store.index, "WEB1-3"));
    expect(outcome.changes.map((change) => change.rel)).toEqual([
      "audits/AUDIT_WEB_1.md",
      "BACKLOG.md",
      "summaries/SUMMARY_WEB.md",
    ]);
    expect(outcome.notes).toEqual(["WEB1-3 is still mentioned in audits/AUDIT_WEB_1.ADDITION.md"]);
    expect(await read(store, "BACKLOG.md")).not.toContain("| WEB1-3 |");
  });

  test("refuses to leave an audit without open items in the work folders", async () => {
    const store = await sandbox();
    await apply(store, closeItem(store.index, "MOB1-1"));
    const next = await reopen(store);
    const refused = await applyPlan(next, closeItem(next.index, "MOB1-2"));
    expect(refused.written).toBe(false);
    expect(refused.introduced.map((d) => d.rule)).toEqual(["lifecycle"]);

    await apply(next, closeItem(next.index, "MOB1-2", { archive: true }));
    expect(
      await Bun.file(join(store.root, ".archive/audits/mobile/AUDIT_MOBILE_1.md")).exists(),
    ).toBe(true);
    expect(await Bun.file(join(store.root, "audits/mobile/AUDIT_MOBILE_1.md")).exists()).toBe(
      false,
    );
  });

  test("keeps CRLF line breaks", async () => {
    const store = await sandbox();
    const rel = "audits/AUDIT_API_2.md";
    await Bun.write(join(store.root, rel), (await read(store, rel)).replaceAll("\n", "\r\n"));
    const crlf = await reopen(store);
    await apply(crlf, closeItem(crlf.index, "API2-3"));
    const text = await read(store, rel);
    expect(text.split("\r\n").length).toBe(text.split("\n").length);
    expect(text).not.toContain("API2-3 | P2");
  });
});

describe("item defer and add", () => {
  test("defer rewrites the status cell and the heading note", async () => {
    const store = await sandbox();
    await apply(store, deferItem(store.index, "WEB1-8"));
    const text = await read(store, "audits/AUDIT_WEB_1.md");
    expect(text).toContain("| WEB1-8 | P3 | a11y | web | deferred |");
    expect(text).toContain("### WEB1-8. Thread list items have no accessible name (deferred)");
  });

  test("add takes the next number, fills the table's columns and appends a section", async () => {
    const store = await sandbox();
    const plan = addItem(store.index, {
      document: "AUDIT_API_2",
      values: { priority: "P1", owner: "api", what: "Session cookies lack SameSite" },
    });
    await apply(store, plan);
    const text = await read(store, "audits/AUDIT_API_2.md");
    expect(text).toContain("| API2-4 | P2 | infra | open | Database backups");
    expect(text).toContain("| API2-5 | P1 | api | open | Session cookies lack SameSite |");
    expect(text.endsWith("## API2-5. Session cookies lack SameSite (open)\n")).toBe(true);
  });

  test("in a ledger of several tables, section picks the table, its id code and its place", async () => {
    const store = await sandbox();
    const plan = addItem(store.index, {
      document: "DEBT",
      values: { section: "Server", what: "Typing indicators batched per thread" },
    });
    expect(plan.notes).toEqual(["added DEBT-S3 to DEBT.md"]);
    await apply(store, plan);
    const text = await read(store, "DEBT.md");
    expect(text).toContain(
      "| DEBT-S3 | open | Typing indicators batched per thread |  |\n<!-- /ledger -->",
    );
    expect(text).toContain(
      "`api/search/` holds no index code.\n\n### DEBT-S3. Typing indicators batched per thread (open)\n\n## Infra",
    );
    expect(() =>
      addItem(store.index, { document: "DEBT", values: { section: "Mobile", what: "x" } }),
    ).toThrow(/no ledger table under Mobile; known: Server, Infra/);
  });

  test("an id outside its section's code is reported", async () => {
    const store = await sandbox();
    const text = (await read(store, "DEBT.md")).replace("| DEBT-I1 |", "| DEBT-S9 |");
    await Bun.write(join(store.root, "DEBT.md"), text);
    const diagnostics = runRules((await reopen(store)).rules, (await reopen(store)).index);
    expect(diagnostics.filter((d) => d.rule === "id-format").map((d) => d.message)).toEqual([
      "DEBT-S9 does not match DEBT-{section}{n}",
    ]);
  });

  test("add never reuses the number of a closed item", async () => {
    const store = await sandbox();
    await apply(store, closeItem(store.index, "WEB1-8"));
    const next = await reopen(store);
    const plan = addItem(next.index, {
      document: "AUDIT_WEB_1",
      values: { priority: "P3", owner: "web", what: "Something new" },
    });
    expect(plan.notes).toEqual(["added WEB1-9 to audits/AUDIT_WEB_1.md"]);
  });

  test("add rejects pipes and missing required columns", async () => {
    const store = await sandbox();
    const values = { priority: "P1", owner: "api", what: "a | b" };
    expect(() => addItem(store.index, { document: "AUDIT_API_2", values })).toThrow(/\|/);
    expect(() => addItem(store.index, { document: "AUDIT_API_2", values: { what: "x" } })).toThrow(
      /missing priority, owner/,
    );
  });
});

describe("doc operations", () => {
  test("new continues the series and derives the slug", async () => {
    const store = await sandbox();
    const plan = await newDocument(store.index, {
      type: "audit",
      topic: "web",
      fields: { scope: "web/" },
    });
    const [change] = plan.changes;
    expect(change?.rel).toBe("audits/AUDIT_WEB_2.md");
    expect(change?.text).toContain("slug: WEB2\nscope: web/\n");
    expect(change?.text).toContain("**Status:** open. Checked 2026-10-15.");
    expect((await applyPlan(store, plan)).introduced).toEqual([]);
  });

  test("new asks for required fields and refuses taken names", async () => {
    const store = await sandbox();
    await expect(newDocument(store.index, { type: "plan", topic: "x" })).rejects.toThrow(
      /needs scope/,
    );
    await expect(
      newDocument(store.index, { type: "plan", topic: "offline mode", fields: { scope: "s" } }),
    ).rejects.toThrow(/PLAN_OFFLINE_MODE.md already exists/);
  });

  test("new transliterates Cyrillic topics and keeps the first words of long ones", () => {
    expect(nameBase("Переезд архива на trove: чего не хватает")).toBe(
      "PEREEZD_ARKHIVA_NA_TROVE_CHEGO_NE_KHVATAET",
    );
    expect(nameBase("Щука, ёж и съезд")).toBe("SHCHUKA_EZH_I_SEZD");
    expect(nameBase("Їжак і ґанок, ўсё")).toBe("YIZHAK_I_GANOK_USE");
    expect(nameBase("one two three four five six seven eight nine")).toBe(
      "ONE_TWO_THREE_FOUR_FIVE_SIX_SEVEN_EIGHT",
    );
    expect(() => nameBase("東京")).toThrow(/--name/);
  });

  test("archive moves the file, rebases its links and retargets links to it", async () => {
    const store = await sandbox();
    await apply(store, archivePlan(store.index, requireDocument(store.index, "PLAN_PUSH_RETRY")));
    const moved = await read(store, ".archive/plans/PLAN_PUSH_RETRY.md");
    expect(moved).toContain("status: archived");
    expect(moved).toContain("**Status:** archived.");
    expect(await read(store, "DEBT.md")).toContain("(.archive/plans/PLAN_PUSH_RETRY.md)");

    const next = await reopen(store);
    expect(runRules(next.rules, next.index).filter((d) => d.severity === "error")).toEqual([]);
  });

  test("archive rebases links that leave the store", async () => {
    const store = await sandbox();
    const doc = requireDocument(store.index, "AUDIT_WEB_1");
    const [moved] = archivePlan(store.index, doc).changes;
    expect(moved?.text).toContain("(../../../harbor/web/src/composer/send.ts#L41-L63)");
    expect(moved?.text).toContain("(../../plans/PLAN_OFFLINE_MODE.md)");
  });

  test("set status writes the label in the header and the status line", async () => {
    const store = await sandbox();
    await apply(store, setDocumentField(store.index, "PLAN_OFFLINE_MODE", "status", "in-progress"));
    const text = await read(store, "plans/PLAN_OFFLINE_MODE.md");
    expect(text).toContain("status: in progress\n");
    expect(text).toContain("**Status:** in progress. Waits for");
    expect(() => setDocumentField(store.index, "PLAN_OFFLINE_MODE", "status", "done")).toThrow(
      /unknown status/,
    );
  });

  test("dry run writes nothing", async () => {
    const store = await sandbox();
    const before = await read(store, "RISKS.md");
    const outcome = await applyPlan(
      store,
      setDocumentField(store.index, "RISKS", "checked", "2026-10-15"),
      {
        dryRun: true,
      },
    );
    expect(outcome.written).toBe(false);
    expect(outcome.changes[0]?.previous).toBe(before);
    expect(await read(store, "RISKS.md")).toBe(before);
  });
});
