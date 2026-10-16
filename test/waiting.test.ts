import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentField, selectDocuments, selectItems } from "../src/core/index/query.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { requireDocument } from "../src/core/ops/find.ts";
import { closeItem } from "../src/core/ops/item-close.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<Store> => {
  const root = await mkdtemp(join(tmpdir(), "trove-waiting-"));
  copies.push(root);
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  return openStore({ cwd: root, store: root, today: TODAY });
};

const reopen = (store: Store) => openStore({ cwd: store.root, store: store.root, today: TODAY });

const edit = async (store: Store, rel: string, change: (text: string) => string) => {
  const path = join(store.root, rel);
  await Bun.write(path, change(await Bun.file(path).text()));
};

/** The web ledger gets an `until` column; WEB1-5 is deferred until WEB1-7. */
const withUntil = async (store: Store, until: string) => {
  await edit(store, "trove.yaml", (text) =>
    text.replace(
      /^( {4}- \{ key: what, label: what is left, required: true \})(?=\r?$)/m,
      "$1\n    - { key: until, label: until }",
    ),
  );
  await edit(store, "audits/AUDIT_WEB_1.md", (text) =>
    text
      .split(/\r?\n/)
      .map((line) => {
        if (line.startsWith("| id |")) return `${line} until |`;
        if (line.startsWith("| -- |")) return `${line} ----- |`;
        if (line.startsWith("| WEB1-5 |")) return `${line} ${until} |`;
        return line.startsWith("| WEB1-") ? `${line}  |` : line;
      })
      .join("\n"),
  );
  return reopen(store);
};

const rulesOf = (store: Store, rule: string) =>
  runRules(store.rules, store.index)
    .filter((d) => d.rule === rule)
    .map((d) => d.message);

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

describe("waiting and deferrals", () => {
  test("blocked_by makes a document wait until what it names is done", async () => {
    const store = await sandbox();
    await edit(store, "plans/PLAN_PUSH_RETRY.md", (text) =>
      text.replace("status: in progress", "status: in progress\nblocked_by: WEB1-1"),
    );
    const blocked = await reopen(store);
    const waiting = selectDocuments(blocked.index, { waiting: ["true"] }).map((doc) => doc.name);
    expect(waiting).toEqual(["PLAN_PUSH_RETRY.md"]);

    await applyPlan(blocked, await closeItem(blocked.index, "WEB1-1"));
    const done = await reopen(store);
    expect(selectDocuments(done.index, { waiting: ["true"] })).toEqual([]);
  });

  test("a deferral whose until is done is reported, and items filter on waiting", async () => {
    const store = await withUntil(await sandbox(), "WEB1-7");
    expect(rulesOf(store, "deferral-lifted")).toEqual([]);
    expect(selectItems(store.index, { waiting: ["true"] })).toEqual([]);

    await applyPlan(store, await closeItem(store.index, "WEB1-7"));
    const lifted = await reopen(store);
    expect(rulesOf(lifted, "deferral-lifted")).toEqual([
      "WEB1-5 waited until WEB1-7, which is done: take it up again",
    ]);
  });

  test("a wait on something that does not exist is reported", async () => {
    const store = await withUntil(await sandbox(), "WEB1-99");
    expect(rulesOf(store, "wait-refs")).toEqual(["WEB1-5 waits for WEB1-99, which names nothing"]);
  });

  test("note is the status line after the status word", async () => {
    const store = await sandbox();
    const plan = requireDocument(store.index, "PLAN_PUSH_RETRY");
    expect(documentField(plan, "note", store.index)).toBe("Stage 1 merged, stage 2 in progress.");
  });
});
