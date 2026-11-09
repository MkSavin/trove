import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import { git } from "../src/core/git/git.ts";
import { migrateArchive } from "../src/core/migrate/migrate.ts";
import { presetConfig } from "../src/core/presets/presets.ts";
import { diagnose } from "../src/core/store/doctor.ts";
import { initStore } from "../src/core/store/init.ts";
import { archiveIgnored, ignoreArchive } from "../src/core/store/search-ignore.ts";
import { listDocuments } from "../src/core/store/walk.ts";
import { openStore, parseConfig, runRules } from "../src/index.ts";
import { captureIo, ROOT } from "./helpers.ts";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};
const savedHome = process.env.KIMI_CODE_HOME;

let workspace = "";

const ignoreOf = (root: string) => Bun.file(join(root, ".ignore")).text();

const newStore = async (): Promise<{ app: string; store: string }> => {
  const app = join(workspace, "app");
  await mkdir(app, { recursive: true });
  await git(app, ["init", "--quiet"]);
  const { store } = await initStore({ cwd: app, language: "en" });
  return { app, store };
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-ignore-"));
  Object.assign(process.env, IDENTITY, {
    TROVE_HOME: join(workspace, "home"),
    KIMI_CODE_HOME: join(workspace, "kimi"),
  });
});

afterEach(async () => {
  delete process.env.TROVE_HOME;
  process.env.KIMI_CODE_HOME = savedHome;
  await rm(workspace, { recursive: true, force: true, maxRetries: 5 });
});

describe("the store's .ignore", () => {
  test("init writes and commits it; it is no document and trips no rule", async () => {
    const { store } = await newStore();
    expect(await ignoreOf(store)).toBe(".archive/\n");
    expect((await git(store, ["status", "--porcelain"])).out).toBe("");
    const opened = await openStore({ cwd: store, store });
    expect(await listDocuments(store, opened.config)).not.toContain(".ignore");
    expect(runRules(opened.rules, opened.index).filter((d) => d.file === ".ignore")).toEqual([]);
  });

  test("merges by line, follows the configured folder, is a no-op when present", async () => {
    const root = join(workspace, "store");
    const base = parseConfig(presetConfig("en"), "trove.yaml");
    const config = { ...base, archive: { ...base.archive, folder: "old" } };
    await Bun.write(join(root, ".ignore"), "build/\r\nnotes");
    expect(await archiveIgnored(root, config)).toBe(false);
    expect(await ignoreArchive(root, config)).toBe(true);
    expect(await ignoreOf(root)).toBe("build/\r\nnotes\nold/\n");
    expect(await ignoreArchive(root, config)).toBe(false);
    expect(await ignoreOf(root)).toBe("build/\r\nnotes\nold/\n");
    expect(await archiveIgnored(root, config)).toBe(true);
  });

  test("migrate writes it and keeps what the archive already had", async () => {
    const source = join(workspace, "notes");
    await cp(join(ROOT, "sandbox"), source, { recursive: true });
    await rm(join(source, "trove.yaml"));
    await Bun.write(join(source, ".ignore"), "scratch/\n");
    await git(source, ["init", "--quiet"]);
    await git(source, ["add", "--all"]);
    await git(source, ["commit", "--quiet", "-m", "docs: history"]);
    await migrateArchive({ cwd: workspace, source: "notes", target: "notes-trove" });
    const target = join(workspace, "notes-trove");
    expect((await ignoreOf(target)).split(/\r?\n/)).toEqual(["scratch/", ".archive/", ""]);
    expect((await git(target, ["status", "--porcelain", "--", ".ignore"])).out).toBe("");
  });

  test("client add kimi backfills it, also from a project with no store at all", async () => {
    const { app, store } = await newStore();
    await rm(join(store, ".ignore"));
    const doctor = captureIo(app);
    expect(await run(["doctor"], doctor)).toBe(0);
    expect(doctor.stdout()).toContain("no .ignore line for the archive");
    expect((await diagnose(app)).stores[0]?.archiveIgnored).toBe(false);

    const io = captureIo(app);
    expect(await run(["client", "add", "kimi"], io)).toBe(0);
    expect(io.stdout()).toContain("not committed yet");
    expect(await ignoreOf(store)).toBe(".archive/\n");
    expect((await diagnose(app)).stores[0]?.archiveIgnored).toBe(true);

    const again = captureIo(app);
    expect(await run(["client", "add", "kimi"], again)).toBe(0);
    expect(again.stdout()).not.toContain("not committed yet");

    const lonely = join(workspace, "lonely");
    await mkdir(lonely);
    expect(await run(["client", "add", "kimi"], captureIo(lonely))).toBe(0);
  });

  test("another client leaves an older store alone", async () => {
    const { app, store } = await newStore();
    await rm(join(store, ".ignore"));
    expect(await run(["client", "add", "cursor"], captureIo(app))).toBe(0);
    expect(await Bun.file(join(store, ".ignore")).exists()).toBe(false);
  });
});
