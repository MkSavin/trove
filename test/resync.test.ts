import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../src/core/git/git.ts";
import { migrateArchive } from "../src/core/migrate/migrate.ts";
import { continueResync, resyncStore } from "../src/core/migrate/resync.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { archivePlan } from "../src/core/ops/doc-archive.ts";
import { requireDocument } from "../src/core/ops/find.ts";
import { closeItem } from "../src/core/ops/item-close.ts";
import type { Plan } from "../src/core/ops/plan.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

let workspace = "";
let source = "";
let target = "";

const open = (): Promise<Store> => openStore({ cwd: target, store: target, today: TODAY });

const edit = async (root: string, rel: string, from: string, to: string) => {
  const file = Bun.file(join(root, rel));
  const text = await file.text();
  expect(text).toContain(from);
  await Bun.write(file, text.replace(from, to));
};

const commitAll = async (root: string, message: string) => {
  await git(root, ["add", "--all"]);
  await git(root, ["commit", "--quiet", "-m", message]);
};

const inStore = async (plan: (store: Store) => Plan | Promise<Plan>, message: string) => {
  const store = await open();
  expect((await applyPlan(store, await plan(store))).introduced).toEqual([]);
  await commitAll(target, message);
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-resync-"));
  Object.assign(process.env, IDENTITY, { TROVE_HOME: join(workspace, "home") });
  source = join(workspace, "notes");
  target = join(workspace, "notes-trove");
  await cp(join(ROOT, "sandbox"), source, { recursive: true });
  await rm(join(source, "trove.yaml"));
  await Bun.write(join(source, "lint.mjs"), "// old checker\n");
  await git(source, ["init", "--quiet"]);
  await commitAll(source, "docs: history");
  await migrateArchive({ cwd: workspace, source, target, drop: ["lint.mjs"] });
});

afterEach(async () => {
  delete process.env.TROVE_HOME;
  await rm(workspace, { recursive: true, force: true, maxRetries: 5 });
});

describe("resync", () => {
  test("right after migration there is nothing to bring", async () => {
    expect((await resyncStore(await open())).upToDate).toBe(true);
  });

  test("brings committed and uncommitted source work and keeps the store's own edits", async () => {
    await inStore((s) => closeItem(s.index, "WEB1-3"), "docs: close WEB1-3");
    await inStore(
      (s) => archivePlan(s.index, requireDocument(s.index, "PLAN_PUSH_RETRY")),
      "docs: archive PLAN_PUSH_RETRY",
    );

    await edit(
      source,
      "audits/AUDIT_API_2.md",
      "accepts any content type",
      "accepts any MIME type",
    );
    await edit(source, "plans/PLAN_PUSH_RETRY.md", "In progress.", "Done.");
    await edit(source, "lint.mjs", "old checker", "still the old checker");
    await rm(join(source, "external", "EXTERNAL_PENTEST_2026-08-30.md"));
    await cp(join(source, "specs", "SPEC_PRESENCE.md"), join(source, "specs", "SPEC_TYPING.md"));
    await edit(source, "specs/SPEC_TYPING.md", "# SPEC_PRESENCE", "# SPEC_TYPING");
    await commitAll(source, "docs: more work");
    await edit(source, "DEBT.md", "Presence fan-out per team", "Presence fan-out per team and org");
    const sourceIndex = (await stat(join(source, ".git", "index"))).mtimeMs;

    const result = await resyncStore(await open());
    expect(result.commit).toBeDefined();
    expect(result.files.map((file) => `${file.outcome} ${file.path}`).toSorted()).toEqual([
      "applied DEBT.md",
      "applied audits/AUDIT_API_2.md",
      "applied external/EXTERNAL_PENTEST_2026-08-30.md",
      "applied plans/PLAN_PUSH_RETRY.md → .archive/plans/PLAN_PUSH_RETRY.md",
      "applied specs/SPEC_TYPING.md",
    ]);

    const read = (rel: string) => Bun.file(join(target, rel)).text();
    expect(await read("audits/AUDIT_API_2.md")).toContain("accepts any MIME type");
    expect(await read("audits/AUDIT_WEB_1.md")).not.toContain("| WEB1-3 |");
    expect(await read(".archive/plans/PLAN_PUSH_RETRY.md")).toContain("Done.");
    expect(await read("BACKLOG.md")).toContain("accepts any MIME type");
    expect(existsSync(join(target, "lint.mjs"))).toBe(false);
    expect(existsSync(join(target, "external", "EXTERNAL_PENTEST_2026-08-30.md"))).toBe(false);
    expect((await git(target, ["log", "-1", "--format=%s"])).out).toBe("docs: resync from notes");

    const store = await open();
    expect(runRules(store.rules, store.index).filter((d) => d.severity === "error")).toEqual([]);
    expect((await resyncStore(store)).upToDate).toBe(true);
    expect((await stat(join(source, ".git", "index"))).mtimeMs).toBe(sourceIndex);
  });

  test("a clash waits for a person, then continues", async () => {
    await edit(target, "RISKS.md", "1 open risk.", "1 open risk, checked in the store.");
    await commitAll(target, "docs: store edit");
    await edit(source, "RISKS.md", "1 open risk.", "1 open risk, changed at the source.");

    const stopped = await resyncStore(await open());
    expect(stopped.commit).toBeUndefined();
    expect(stopped.files).toEqual([{ path: "RISKS.md", outcome: "conflict" }]);
    await expect(resyncStore(await open())).rejects.toThrow(/waits for conflicts/);
    await expect(continueResync(await open())).rejects.toThrow(/conflict markers left in RISKS.md/);

    const risks = Bun.file(join(target, "RISKS.md"));
    const resolved = (await risks.text()).replace(
      /<{7}[\s\S]*?>{7}[^\r\n]*\r?\n/,
      "**Status:** current. 1 open risk, both sides agree. Checked 2026-10-12.\n",
    );
    await Bun.write(risks, resolved);
    expect((await continueResync(await open())).commit).toBeDefined();
    expect((await resyncStore(await open())).upToDate).toBe(true);
  });

  test("stores migrated before the state was recorded still resync, given the source", async () => {
    await git(target, ["update-ref", "-d", "refs/trove/source-state"]);
    await git(target, ["config", "--unset", "trove.migrate.source"]);
    await expect(resyncStore(await open())).rejects.toThrow(/pass --source/);

    await edit(source, "RISKS.md", "1 open risk.", "1 open risk, source moved on.");
    const result = await resyncStore(await open(), source);
    expect(result.files.map((file) => file.path)).toEqual(["RISKS.md"]);
  });
});
