import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import { selectDocuments, selectItems } from "../src/core/index/query.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { addItem } from "../src/core/ops/item-add.ts";
import { deferInto } from "../src/core/ops/item-defer.ts";
import type { Plan } from "../src/core/ops/plan.ts";
import { LANGUAGES, presetConfig } from "../src/core/presets/presets.ts";
import { lineDiff } from "../src/core/text/diff.ts";
import { openStore, parseConfig, runRules, type Store } from "../src/index.ts";
import { captureIo, ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<Store> => {
  const root = await mkdtemp(join(tmpdir(), "trove-deferred-"));
  copies.push(root);
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  return openStore({ cwd: root, store: root, today: TODAY });
};

const read = (store: Store, rel: string) => Bun.file(join(store.root, rel)).text();
const reopen = (store: Store) => openStore({ cwd: store.root, store: store.root, today: TODAY });

const apply = async (store: Store, plan: Plan | Promise<Plan>) => {
  const outcome = await applyPlan(store, await plan);
  expect(outcome.introduced).toEqual([]);
  return outcome;
};

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id).sort();

const messagesOf = (store: Store, rule: string) =>
  runRules(store.rules, store.index)
    .filter((d) => d.rule === rule)
    .map((d) => d.message);

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

describe("deferred work register", () => {
  test.each(LANGUAGES)("the %s preset declares it with its own ledger", (language) => {
    const ledger = parseConfig(presetConfig(language), language).types.deferred?.ledger;
    expect(ledger?.id).toBe("DEF-{n}");
    expect(ledger?.columns.map((column) => column.key)).toEqual([
      "id",
      "priority",
      "owner",
      "status",
      "what",
      "from",
      "why",
      "until",
      "checked",
    ]);
    expect(ledger?.open).toEqual(["deferred"]);
    expect(Object.keys(ledger?.closed ?? {})).toEqual(["done", "dropped", "moved"]);
  });

  test("item add appends a deferred item with the next DEF id", async () => {
    const store = await sandbox();
    const values = {
      what: "Message reactions",
      from: "PLAN_PUSH_RETRY",
      why: "Push comes first",
      until: "PLAN_PUSH_RETRY",
    };
    const plan = addItem(store.index, { document: "DEFERRED", values });
    expect(plan.notes).toEqual(["added DEF-4 to DEFERRED.md"]);
    await apply(store, plan);
    const text = await read(store, "DEFERRED.md");
    expect(text).toContain(
      "| DEF-4 |  |  | deferred | Message reactions | PLAN_PUSH_RETRY | Push comes first | PLAN_PUSH_RETRY |\n<!-- /ledger -->",
    );
    expect(text.endsWith("### DEF-4. Message reactions (deferred)\n")).toBe(true);
  });

  test("item defer --to moves an open item in, recording where it went and where it came from", async () => {
    const store = await sandbox();
    const before = await read(store, "DEFERRED.md");
    const plan = await deferInto(store.index, "WEB1-3", {
      to: "DEFERRED",
      values: { why: "Rare after the reconnect fix", until: "2026-12-01" },
    });
    expect(plan.notes).toEqual([
      "WEB1-3 → DEF-4",
      "not in the target table, dropped: module",
      "WEB1-3 is still mentioned in audits/AUDIT_WEB_1.RESOLVED.md",
    ]);
    await apply(store, plan);

    const web = await read(store, "audits/AUDIT_WEB_1.md");
    expect(web).not.toContain("| WEB1-3 |");
    expect(web).not.toContain("### WEB1-3.");
    expect(await read(store, "audits/AUDIT_WEB_1.RESOLVED.md")).toContain(
      "| WEB1-3 | P2 | threads | web | moved | Unread counter drifts after a reconnect: deltas are applied twice → DEF-4 |",
    );
    const after = await read(store, "DEFERRED.md");
    expect(lineDiff(before, after).map((line) => `${line.kind}${line.text}`)).toEqual([
      "+| DEF-4 | P2 | web | deferred | Unread counter drifts after a reconnect: deltas are applied twice | [WEB1-3](audits/AUDIT_WEB_1.md) | Rare after the reconnect fix | 2026-12-01 |",
      "+",
      "+### DEF-4. Unread counter drifts after a reconnect (deferred)",
      "+",
      "+The reconnect handler replays missed events and also refetches counters, so each missed message counts twice, [threads.ts:120-151](../harbor/web/src/stores/threads.ts#L120-L151).",
    ]);
    expect(messagesOf(await reopen(store), "deferral-lifted")).toEqual([]);
  });

  test("item defer --to refuses a target without a ledger or a deferred status", async () => {
    const store = await sandbox();
    await expect(deferInto(store.index, "WEB1-3", { to: "RISKS" })).rejects.toThrow(
      "RISKS.md has no ledger",
    );
    const config = join(store.root, "trove.yaml");
    await Bun.write(config, (await read(store, "trove.yaml")).replaceAll("[deferred]", "[parked]"));
    const parked = await reopen(store);
    await expect(deferInto(parked.index, "WEB1-3", { to: "DEFERRED" })).rejects.toThrow(
      "the status column of DEFERRED.md has no deferred value",
    );
  });

  test("the CLI defers in place without --to and into the register with it", async () => {
    const store = await sandbox();
    const flags = ["--store", store.root];
    const lone = captureIo(store.root);
    expect(await run(["item", "defer", "WEB1-4", "why=later", ...flags], lone)).toBe(2);
    expect(lone.stderr()).toContain("need --to");

    const io = captureIo(store.root);
    const args = ["item", "defer", "WEB1-4", "--to", "DEFERRED", "why=After the redesign"];
    expect(await run([...args, ...flags], io)).toBe(0);
    expect(await read(store, "DEFERRED.md")).toContain(
      "| [WEB1-4](audits/AUDIT_WEB_1.md) | After the redesign |  |",
    );
  });

  test("a passed until date lifts the deferral; a date ahead or a known ref does not", async () => {
    const store = await sandbox();
    expect(messagesOf(store, "deferral-lifted")).toEqual([]);
    expect(messagesOf(store, "wait-refs")).toEqual([]);

    const path = join(store.root, "DEFERRED.md");
    await Bun.write(path, (await read(store, "DEFERRED.md")).replace("2027-03-01", TODAY));
    expect(messagesOf(await reopen(store), "deferral-lifted")).toEqual([
      `DEF-3 waited until ${TODAY}, which has come: take it up again`,
    ]);
  });

  test("the register stays apart: only a filter on type, path or id lists its items", async () => {
    const store = await sandbox();
    expect(ids(selectItems(store.index, { type: ["deferred"] }))).toEqual([
      "DEF-1",
      "DEF-2",
      "DEF-3",
    ]);
    expect(ids(selectItems(store.index, { status: ["deferred"] }))).toEqual(["MOB1-3", "WEB1-5"]);
    expect(ids(selectItems(store.index, {})).filter((id) => id.startsWith("DEF-"))).toEqual([]);
    expect(ids(selectItems(store.index, { id: ["DEF-2"] }))).toEqual(["DEF-2"]);
    const registers = selectDocuments(store.index, { type: ["deferred"] }).map((doc) => doc.rel);
    expect(registers).toEqual(["DEFERRED.md"]);
  });
});
