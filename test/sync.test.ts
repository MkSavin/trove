import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../src/core/git/git.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { setDocumentField } from "../src/core/ops/doc-set.ts";
import { closeItem } from "../src/core/ops/item-close.ts";
import type { Plan } from "../src/core/ops/plan.ts";
import { prepareRepository } from "../src/core/store/hook.ts";
import { syncOutcome, syncStore } from "../src/core/sync/sync.ts";
import { openStore, type Store } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

let workspace = "";
let remote = "";

const open = (root: string): Promise<Store> => openStore({ cwd: root, store: root, today: TODAY });

const run = async (root: string, plan: (store: Store) => Plan | Promise<Plan>) => {
  const store = await open(root);
  const outcome = await applyPlan(store, await plan(store));
  expect(outcome.introduced).toEqual([]);
  return syncOutcome(store, outcome);
};

const log = async (root: string, ref = "HEAD"): Promise<string[]> =>
  (await git(root, ["log", "--format=%s", ref])).out.split("\n");

/** The sandbox as a store with `sync` set, committed and pushed to a bare remote. */
const storeWithRemote = async (mode: "commit" | "push"): Promise<string> => {
  const root = join(workspace, "store");
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  const config = Bun.file(join(root, "trove.yaml"));
  await Bun.write(config, (await config.text()).replace("sync: off", `sync: ${mode}`));
  await git(root, ["init", "--quiet", "--initial-branch=main"]);
  await prepareRepository(root);
  await git(root, ["add", "--all"]);
  await git(root, ["commit", "--quiet", "-m", "docs: base"]);
  await git(root, ["remote", "add", "origin", remote]);
  await git(root, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  return root;
};

const secondClone = async (): Promise<string> => {
  const root = join(workspace, "second");
  await git(workspace, ["clone", "--quiet", remote, root]);
  await prepareRepository(root);
  return root;
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-sync-"));
  Object.assign(process.env, IDENTITY);
  remote = join(workspace, "remote.git");
  await git(workspace, ["init", "--quiet", "--bare", "--initial-branch=main", remote]);
});

afterEach(() => rm(workspace, { recursive: true, force: true, maxRetries: 5 }));

describe("sync after an operation", () => {
  test("commit mode makes one commit with only the touched files", async () => {
    const root = await storeWithRemote("commit");
    const result = await run(root, (s) => setDocumentField(s.index, "RISKS", "checked", TODAY));
    expect(result.commit).toBeDefined();
    expect(result.pushed).toBe(false);
    expect((await log(root))[0]).toBe("docs: check RISKS");
    expect((await git(root, ["show", "--name-only", "--format="])).out).toBe("RISKS.md");
    expect((await log(remote, "main"))[0]).toBe("docs: base");
  });

  test("push mode pushes after rebasing over unrelated work", async () => {
    const root = await storeWithRemote("push");
    const second = await secondClone();
    expect((await run(second, (s) => closeItem(s.index, "API2-1"))).pushed).toBe(true);

    const result = await run(root, (s) => closeItem(s.index, "MOB1-1"));
    expect(result).toMatchObject({ pushed: true, warnings: [] });
    expect((await log(remote, "main")).slice(0, 3)).toEqual([
      "docs: rebuild reports",
      "docs: close MOB1-1",
      "docs: close API2-1",
    ]);
    const backlog = (await git(remote, ["show", "main:BACKLOG.md"])).out;
    expect(backlog).not.toContain("| API2-1 |");
    const summary = (await git(remote, ["show", "main:summaries/SUMMARY_OUTSIDE_WEB.md"])).out;
    expect(summary).toContain("| API2-2 |");
    expect(summary).not.toMatch(/\| (API2-1|MOB1-1) \|/);
    expect(backlog).not.toContain("| MOB1-1 |");
  });

  test("a conflict in a generated report is rebuilt, not left to a person", async () => {
    const root = await storeWithRemote("push");
    const second = await secondClone();
    const backlog = join(second, "BACKLOG.md");
    await Bun.write(
      backlog,
      (await Bun.file(backlog).text()).replace("Attachment upload", "Edited by hand"),
    );
    await git(second, ["commit", "--quiet", "-am", "docs: hand-edit the backlog"]);
    await git(second, ["push", "--quiet"]);

    const result = await run(root, (s) => closeItem(s.index, "API2-1"));
    expect(result).toMatchObject({ pushed: true, warnings: [] });
    expect((await log(remote, "main"))[0]).toBe("docs: rebuild reports");
    const merged = (await git(remote, ["show", "main:BACKLOG.md"])).out;
    expect(merged).not.toContain("| API2-1 |");
    expect(merged).toContain("Attachment upload");
  });

  test("a conflict in a hand-written file stops before pushing and keeps the local commit", async () => {
    const root = await storeWithRemote("push");
    const second = await secondClone();
    await run(second, (s) => setDocumentField(s.index, "RISKS", "checked", "2026-10-13"));

    const result = await run(root, (s) =>
      setDocumentField(s.index, "RISKS", "checked", "2026-10-14"),
    );
    expect(result.pushed).toBe(false);
    expect(result.warnings[0]).toMatch(/conflict in RISKS.md: not pushed/);
    expect((await log(root))[0]).toBe("docs: check RISKS");
    expect((await git(root, ["status", "--porcelain"])).out).toBe("");
  });

  test("leaves git alone when sync is off or the check is red", async () => {
    const off = join(workspace, "off");
    await cp(join(ROOT, "sandbox"), off, { recursive: true });
    const idle = await run(off, (s) => setDocumentField(s.index, "RISKS", "checked", TODAY));
    expect(idle).toMatchObject({ mode: "off", commit: undefined });

    const root = await storeWithRemote("commit");
    await Bun.write(join(root, "plans", "PLAN_BROKEN.md"), "no header\n");
    const red = await run(root, (s) => setDocumentField(s.index, "RISKS", "checked", TODAY));
    expect(red.warnings).toEqual(["check is red: not committed"]);
    expect((await log(root))[0]).toBe("docs: base");
  });

  test("never commits into a repository the store is only nested in", async () => {
    const outer = join(workspace, "outer");
    await git(workspace, ["init", "--quiet", outer]);
    const root = join(outer, "docs");
    await cp(join(ROOT, "sandbox"), root, { recursive: true });
    const config = Bun.file(join(root, "trove.yaml"));
    await Bun.write(config, (await config.text()).replace("sync: off", "sync: commit"));
    const result = await run(root, (s) => setDocumentField(s.index, "RISKS", "checked", TODAY));
    expect(result.warnings[0]).toMatch(/not the root of a git repository/);
  });
});

describe("trove sync", () => {
  test("commits hand edits with rebuilt reports and pushes", async () => {
    const root = await storeWithRemote("push");
    const audit = join(root, "audits", "AUDIT_API_2.md");
    await Bun.write(audit, (await Bun.file(audit).text()).replace(/^\| API2-2 .*\r?\n/m, ""));

    const result = await syncStore(await open(root), "docs: drop API2-2 by hand");
    expect(result.pushed).toBe(true);
    expect(
      (await git(root, ["show", "--name-only", "--format="])).out.split("\n").toSorted(),
    ).toEqual(["BACKLOG.md", "audits/AUDIT_API_2.md", "summaries/SUMMARY_OUTSIDE_WEB.md"]);
    expect((await log(remote, "main"))[0]).toBe("docs: drop API2-2 by hand");
  });

  test("refuses while the check is red", async () => {
    const root = await storeWithRemote("commit");
    await Bun.write(join(root, "plans", "PLAN_BROKEN.md"), "no header\n");
    await expect(syncStore(await open(root))).rejects.toThrow(/check is red/);
  });
});
