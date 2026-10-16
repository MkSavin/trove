import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import { renderView } from "../src/core/live/views.ts";
import { toPosix } from "../src/core/store/paths.ts";
import { today } from "../src/core/text/dates.ts";
import { verifyCachePath } from "../src/core/verify/cache.ts";
import { expandCommand } from "../src/core/verify/command.ts";
import { mapLimit } from "../src/core/verify/pool.ts";
import type { VerifyResult } from "../src/core/verify/run.ts";
import { openStore, type Store } from "../src/index.ts";
import { captureIo, ROOT, TODAY } from "./helpers.ts";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 5 })),
  );
});

/** A copy of the sandbox with `verify-cmd` written into the named documents. */
const sandbox = async (commands: Readonly<Record<string, string>>): Promise<string> => {
  const workspace = await mkdtemp(join(tmpdir(), "trove-verify-"));
  workspaces.push(workspace);
  const store = join(workspace, "store");
  await cp(join(ROOT, "sandbox"), store, { recursive: true });
  for (const [rel, command] of Object.entries(commands)) {
    const path = join(store, rel);
    const text = (await Bun.file(path).text()).replace(/^verify-cmd: .*\n/m, "");
    await Bun.write(path, text.replace(/^---\n/, `---\nverify-cmd: ${command}\n`));
  }
  return store;
};

const open = (store: string): Promise<Store> => openStore({ cwd: store, store, today: TODAY });

const check = async (store: string, ...args: string[]) => {
  const io = captureIo(store);
  const code = await run(["check", "--store", store, "--json", ...args], io);
  const parsed = JSON.parse(io.stdout()) as { verify?: VerifyResult[] };
  return { code, verify: parsed.verify };
};

const outcomes = (results: readonly VerifyResult[] | undefined) =>
  Object.fromEntries((results ?? []).map((result) => [result.rel, result.outcome]));

const SPEC = "specs/SPEC_PRESENCE.md";
const PLAN = "plans/PLAN_PUSH_RETRY.md";
const ARCHIVED = ".archive/specs/SPEC_SEARCH.md";

describe("verify-cmd", () => {
  test("is a header field every document may carry", async () => {
    const store = await sandbox({ [SPEC]: "exit 0" });
    const io = captureIo(store);
    expect(await run(["check", SPEC, "--store", store], io)).toBe(0);
    expect(io.stdout()).not.toContain("unknown field");
  });

  test("plain check runs nothing", async () => {
    const store = await sandbox({ [SPEC]: "exit 1" });
    const { code, verify } = await check(store);
    expect(code).toBe(0);
    expect(verify).toBeUndefined();
    expect(await Bun.file(verifyCachePath(store)).exists()).toBe(false);
  });

  test("--verify runs work documents, fails on a non-zero exit and skips the archive", async () => {
    const store = await sandbox({
      [SPEC]: "echo still here && exit 0",
      [PLAN]: "echo gone && exit 3",
      [ARCHIVED]: "exit 1",
    });
    const { code, verify } = await check(store, "--verify");
    expect(code).toBe(1);
    expect(outcomes(verify)).toEqual({ [PLAN]: "failed", [SPEC]: "ok" });
    const failed = verify?.find((result) => result.rel === PLAN);
    expect(failed?.detail).toBe("exit 3");
    expect(failed?.output).toBe("gone");
  });

  test("narrows to the one file given", async () => {
    const store = await sandbox({ [SPEC]: "exit 0", [PLAN]: "exit 1" });
    const { code, verify } = await check(store, SPEC, "--verify");
    expect(code).toBe(0);
    expect(outcomes(verify)).toEqual({ [SPEC]: "ok" });
  });

  test("fills {store} and {root:name}; a root not checked out here is skipped", async () => {
    const store = await sandbox({
      [SPEC]: "cd {store}/specs && cd {root:harbor} && exit 0",
      [PLAN]: "cd {root:nowhere}",
    });
    const missing = await check(store, "--verify");
    expect(outcomes(missing.verify)).toEqual({ [PLAN]: "failed", [SPEC]: "skipped" });
    expect(missing.verify?.find((r) => r.rel === PLAN)?.detail).toBe("no root nowhere in roots");

    await mkdir(join(store, "..", "harbor"));
    const present = await check(store, SPEC, "--verify");
    expect(present.code).toBe(0);
    expect(outcomes(present.verify)).toEqual({ [SPEC]: "ok" });
  });

  test("runs with stdin closed and without git hook variables", async () => {
    const store = await sandbox({ [SPEC]: 'cat && echo "dir=$GIT_DIR" && exit 1' });
    process.env.GIT_DIR = join(store, "elsewhere");
    try {
      const { verify } = await check(store, "--verify", "--timeout", "10");
      expect(verify?.[0]?.outcome).toBe("failed");
      expect(verify?.[0]?.output).toBe("dir=");
    } finally {
      delete process.env.GIT_DIR;
    }
  });

  test("stops a command at the timeout", async () => {
    const store = await sandbox({ [SPEC]: 'bun -e "await Bun.sleep(20000)"' });
    const started = performance.now();
    const { code, verify } = await check(store, "--verify", "--timeout", "1");
    expect(code).toBe(1);
    expect(verify?.[0]?.outcome).toBe("timed-out");
    expect(verify?.[0]?.detail).toBe("timed out after 1 s");
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test("rejects a timeout or job count that is not a whole number", async () => {
    const store = await sandbox({});
    const io = captureIo(store);
    expect(await run(["check", "--store", store, "--verify", "--jobs", "0"], io)).toBe(2);
    expect(io.stderr()).toContain("--jobs takes a whole number above zero");
  });

  test("the verified column shows the last result without running anything", async () => {
    const store = await sandbox({ [SPEC]: "exit 0", [PLAN]: "exit 1" });
    const view = async () =>
      renderView(
        "documents",
        { type: "spec,plan", place: "work", columns: "name,verified", sort: "name" },
        { index: (await open(store)).index, rel: "NOTES.md", base: {} },
      );
    const date = today();
    expect(await view()).not.toContain(date);

    await check(store, "--verify");
    const filled = await view();
    expect(filled).toContain(`| PLAN_PUSH_RETRY.md | failed ${date} |`);
    expect(filled).toContain(`| SPEC_PRESENCE.md | ok ${date} |`);
    expect(filled).toContain("| PLAN_OFFLINE_MODE.md | — |");

    const path = join(store, SPEC);
    await Bun.write(path, (await Bun.file(path).text()).replace("exit 0", "exit 0 && exit 0"));
    expect(await view()).toContain("| SPEC_PRESENCE.md | — |");
  });
});

describe("expandCommand", () => {
  test("writes paths with forward slashes and reports the first problem", async () => {
    const store = await open(await sandbox({}));
    const harbor = join(store.root, "..", "harbor");
    await mkdir(harbor);
    expect(expandCommand("ls {root:harbor} {store}", store.root, store.config)).toEqual({
      kind: "ready",
      command: `ls ${toPosix(harbor)} ${toPosix(store.root)}`,
    });
    expect(expandCommand("{root:x} {root:y}", store.root, store.config)).toEqual({
      kind: "unknown-root",
      root: "x",
    });
  });
});

describe("mapLimit", () => {
  test("keeps the order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapLimit([30, 10, 20, 0, 5], 2, async (ms) => {
      running += 1;
      peak = Math.max(peak, running);
      await Bun.sleep(ms);
      running -= 1;
      return ms * 2;
    });
    expect(result).toEqual([60, 20, 40, 0, 10]);
    expect(peak).toBe(2);
  });
});
