import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import { git } from "../src/core/git/git.ts";
import { sourceHealth } from "../src/core/migrate/drift.ts";
import { migrateArchive } from "../src/core/migrate/migrate.ts";
import { continueResync, resyncStore } from "../src/core/migrate/resync.ts";
import { sealSource } from "../src/core/migrate/seal.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { archivePlan } from "../src/core/ops/doc-archive.ts";
import { requireDocument } from "../src/core/ops/find.ts";
import { closeItem } from "../src/core/ops/item-close.ts";
import type { Plan } from "../src/core/ops/plan.ts";
import { diagnose } from "../src/core/store/doctor.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { captureIo, ROOT, TODAY } from "./helpers.ts";

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

describe("resync of a document the source moved into its archive", () => {
  const FROM = "plans/PLAN_PUSH_RETRY.md";
  const TO = ".archive/plans/PLAN_PUSH_RETRY.md";

  const archiveAtSource = async () => {
    await git(source, ["mv", FROM, TO]);
    await edit(source, TO, "status: in progress", "status: archived");
    await edit(source, TO, "**Status:** in progress.", "**Status:** archived.");
    await commitAll(source, "docs: archive PLAN_PUSH_RETRY");
  };

  test("is one move that keeps the store's own edits", async () => {
    await edit(target, FROM, "Not started.", "Not started, needs an owner.");
    await commitAll(target, "docs: store edit");
    await archiveAtSource();

    const result = await resyncStore(await open());
    expect(result.files).toEqual([{ path: `${FROM} → ${TO}`, outcome: "moved" }]);
    expect(existsSync(join(target, FROM))).toBe(false);
    const moved = await Bun.file(join(target, TO)).text();
    expect(moved).toContain("status: archived");
    expect(moved).toContain("needs an owner");
    expect((await resyncStore(await open())).upToDate).toBe(true);
  });

  test("is printed as one moved line", async () => {
    await archiveAtSource();
    const io = captureIo(workspace);
    expect(await run(["resync", "--store", target], io)).toBe(0);
    const lines = io.stdout().split("\n");
    expect(lines.filter((line) => line.includes("PLAN_PUSH_RETRY"))).toEqual([
      expect.stringMatching(/^ {2}moved +plans\/PLAN_PUSH_RETRY\.md → \.archive\//),
    ]);
  });

  test("is not made twice when the store archived the document too", async () => {
    await inStore(
      (s) => archivePlan(s.index, requireDocument(s.index, "PLAN_PUSH_RETRY")),
      "docs: archive PLAN_PUSH_RETRY",
    );
    await archiveAtSource();
    const result = await resyncStore(await open());
    expect(result.files).toEqual([{ path: `${FROM} → ${TO}`, outcome: "moved" }]);
    expect(existsSync(join(target, FROM))).toBe(false);
  });
});

describe("sealing the source", () => {
  test("marks the archive as moved, commits only that there and is not brought back", async () => {
    await edit(source, "RISKS.md", "1 open risk.", "1 open risk, edited at the source.");
    const io = captureIo(workspace);
    expect(await run(["resync", "--seal", "--store", target], io)).toBe(0);
    expect(io.stdout()).toContain(`✔ sealed ${source}: MOVED.md, AGENTS.md, committed`);

    expect(await Bun.file(join(source, "MOVED.md")).text()).toContain("`../notes-trove`");
    const agents = await Bun.file(join(source, "AGENTS.md")).text();
    expect(agents.split("\n")[0]).toStartWith(
      "> **Moved.** This archive moved to `../notes-trove`",
    );
    expect((await git(source, ["log", "-1", "--format=%s"])).out).toBe(
      "docs: moved to notes-trove",
    );
    expect((await git(source, ["status", "--porcelain"])).out).toBe("M RISKS.md");
    expect(await Bun.file(join(target, "RISKS.md")).text()).toContain("edited at the source");

    expect(existsSync(join(target, "MOVED.md"))).toBe(false);
    expect((await sourceHealth(target))?.changed).toBe(false);
    expect((await resyncStore(await open())).upToDate).toBe(true);

    await sealSource(target);
    const again = await Bun.file(join(source, "AGENTS.md")).text();
    expect(again.match(/\*\*Moved\.\*\*/g)).toHaveLength(1);
  });

  test("creates AGENTS.md when the archive has none", async () => {
    await git(source, ["rm", "--quiet", "AGENTS.md"]);
    await commitAll(source, "docs: no agent notes");
    expect((await resyncStore(await open())).commit).toBeDefined();
    await sealSource(target);
    expect(await Bun.file(join(source, "AGENTS.md")).text()).toStartWith("> **Moved.**");
  });

  test("refuses while the archive holds work the store has not taken in", async () => {
    await edit(source, "RISKS.md", "1 open risk.", "1 open risk, not resynced.");
    await expect(sealSource(target)).rejects.toThrow(/run trove resync first/);
    expect(existsSync(join(source, "MOVED.md"))).toBe(false);
  });
});

describe("doctor and the source", () => {
  const app = () => join(workspace, "app");

  beforeEach(async () => {
    await git(workspace, ["init", "--quiet", "app"]);
    await Bun.write(
      join(app(), ".trove.yaml"),
      "stores:\n  - name: main\n    path: ../notes-trove\n",
    );
  });

  const changed = async () => (await diagnose(app())).stores[0]?.source?.changed;

  test("warns when the archive changed after the last resync", async () => {
    expect((await diagnose(app())).stores[0]?.source).toEqual({ path: source, changed: false });

    await edit(source, "RISKS.md", "1 open risk.", "1 open risk, edited at the source.");
    expect(await changed()).toBe(true);
    const io = captureIo(app());
    expect(await run(["doctor"], io)).toBe(0);
    expect(io.stdout()).toContain(`! main: ${source} changed after the last resync`);

    await commitAll(source, "docs: risks");
    expect(await changed()).toBe(true);
    await resyncStore(await open());
    expect(await changed()).toBe(false);
  });

  test("compares a source that is not a repository too", async () => {
    const plain = join(workspace, "plain");
    await cp(join(ROOT, "sandbox"), plain, { recursive: true });
    await rm(join(plain, "trove.yaml"));
    await rm(target, { recursive: true, force: true, maxRetries: 5 });
    await migrateArchive({ cwd: workspace, source: plain, target });
    expect(await changed()).toBe(false);

    await Bun.write(join(plain, "notes.txt"), "a new file\n");
    expect(await changed()).toBe(true);
  });
});
