import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "../src/cli/run.ts";
import { codeTarget } from "../src/core/index/code-target.ts";
import { codeUsers } from "../src/core/index/code-users.ts";
import { openStore, type Store } from "../src/index.ts";
import { captureIo, ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<Store> => {
  const root = await mkdtemp(join(tmpdir(), "trove-refs-"));
  copies.push(root);
  const store = join(root, "store");
  await cp(join(ROOT, "sandbox"), store, { recursive: true });
  return openStore({ cwd: store, store, today: TODAY });
};

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

const ids = (store: Store, cwd: string, written: string, from?: number, to?: number, all = false) =>
  codeUsers(
    store.index,
    codeTarget(
      store.index,
      cwd,
      written,
      from === undefined ? undefined : { from, to: to ?? from },
    ),
    all,
  ).rows.map((row) => row.id);

describe("refs", () => {
  test("a file, its folder or a glob, relative to the project", async () => {
    const store = await sandbox();
    expect(ids(store, store.root, "web/src/composer/send.ts")).toEqual(["WEB1-1"]);
    expect(ids(store, store.root, "web/src/stores/")).toEqual(["WEB1-3"]);
    expect(ids(store, store.root, "**/*.go")).toEqual(["API2-1"]);
    expect(ids(store, store.root, "web/src")).toEqual([
      "WEB1-1",
      "WEB1-2",
      "WEB1-3",
      "WEB1-4",
      "STUDY_RECONNECT_STORMS",
    ]);
  });

  test("relative to the working folder or absolute", async () => {
    const store = await sandbox();
    const project = join(store.root, "..", "harbor");
    expect(ids(store, join(project, "web"), "src/threads")).toEqual(["WEB1-2"]);
    expect(ids(store, store.root, "../harbor/web/src/realtime")).toEqual([
      "STUDY_RECONNECT_STORMS",
    ]);
    expect(ids(store, "/", join(project, "api", "auth", "refresh.go"))).toEqual(["API2-1"]);
    expect(() => ids(store, "/", join(store.root, "plans"))).toThrow("is in no code root");
  });

  test("lines narrow references that name lines", async () => {
    const store = await sandbox();
    expect(ids(store, store.root, "web/src/composer/send.ts", 1, 40)).toEqual([]);
    expect(ids(store, store.root, "web/src/composer/send.ts", 63)).toEqual(["WEB1-1"]);
    expect(ids(store, store.root, "web/src/realtime/reconnect.ts", 5)).toEqual([
      "STUDY_RECONNECT_STORMS",
    ]);
  });

  test("archived documents only with --all", async () => {
    const store = await sandbox();
    const rel = ".archive/plans/PLAN_OLD_SEND.md";
    await mkdir(dirname(join(store.root, rel)), { recursive: true });
    await Bun.write(
      join(store.root, rel),
      [
        "---",
        "type: plan",
        "status: archived",
        "date: 2026-01-01",
        "checked: 2026-01-01",
        "scope: web/",
        "---",
        "",
        "# PLAN_OLD_SEND — the old send queue",
        "",
        "Rewrote [send.ts](../../../harbor/web/src/composer/send.ts#L1-L80).",
        "",
      ].join("\n"),
    );
    const io = captureIo(store.root);
    const flags = ["--store", store.root, "--lines", "45-50"];
    expect(await run(["refs", "web/src/composer/send.ts", ...flags], io)).toBe(0);
    expect(io.stdout()).toMatch(/WEB1-1 .* web\/src\/composer\/send\.ts:41-63\n1 reference\n$/);
    const all = captureIo(store.root);
    expect(await run(["refs", "web/src/composer/send.ts", "--all", ...flags], all)).toBe(0);
    expect(all.stdout()).toMatch(/PLAN_OLD_SEND +PLAN_OLD_SEND — the old send queue +archived/);
    expect(all.stdout()).toContain(`${rel}  web/src/composer/send.ts:1-80\n2 references`);
  });

  test("rejects a malformed line range", async () => {
    const store = await sandbox();
    const io = captureIo(store.root);
    const args = ["refs", "send.ts", "--lines", "a-b", "--store", store.root];
    expect(await run(args, io)).toBe(2);
    expect(io.stderr()).toContain("lines take A-B or a single line: a-b");
  });
});
