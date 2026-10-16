import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_MODELINE } from "../src/core/config/json-schema.ts";
import { git, toplevel } from "../src/core/git/git.ts";
import { cloneStore, cloneStores } from "../src/core/store/clone.ts";
import { diagnose } from "../src/core/store/doctor.ts";
import { initStore } from "../src/core/store/init.ts";
import { locateStore } from "../src/core/store/locate.ts";
import { readPointer } from "../src/core/store/pointer.ts";
import { findProject, forgetProject } from "../src/core/store/registry.ts";
import { listDocuments } from "../src/core/store/walk.ts";
import { isInside, samePath } from "../src/core/text/real-path.ts";
import { openStore, parseConfig, runRules } from "../src/index.ts";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

let workspace = "";

const project = async (name: string): Promise<string> => {
  const root = join(workspace, name);
  await mkdir(root, { recursive: true });
  await git(root, ["init", "--quiet"]);
  return root;
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-store-"));
  Object.assign(process.env, IDENTITY, { TROVE_HOME: join(workspace, "home") });
});

afterEach(async () => {
  delete process.env.TROVE_HOME;
  await rm(workspace, { recursive: true, force: true, maxRetries: 5 });
});

describe("init", () => {
  test("creates a green, committed store next to the project and links it", async () => {
    const app = await project("app");
    const result = await initStore({ cwd: app, language: "en" });

    expect(result.store).toBe(join(workspace, "app-trove"));
    expect(result.committed).toBe(true);
    expect(await readPointer(app)).toMatchObject({
      place: "private",
      stores: [{ name: "main", path: "../app-trove" }],
    });
    expect(existsSync(join(app, ".trove.yaml"))).toBe(false);
    expect((await git(app, ["status", "--porcelain"])).out).toBe("");
    expect((await findProject(app))?.stores).toEqual([{ name: "main", path: result.store }]);
    expect(existsSync(join(result.store, ".git", "hooks", "pre-commit"))).toBe(true);
    expect((await git(result.store, ["log", "--format=%s"])).out).toBe("trove: init store");

    const store = await openStore({ cwd: result.store });
    expect(store.config.roots).toEqual({ app: { path: "../app", ref: undefined } });
    expect(await Bun.file(join(result.store, "AGENTS.md")).text()).toContain(
      "| `research` | `research/RESEARCH_` |",
    );
    expect(runRules(store.rules, store.index).filter((d) => d.severity === "error")).toEqual([]);
  });

  test("works without git and refuses a second run", async () => {
    const app = await project("app");
    const result = await initStore({ cwd: app, language: "ru", git: false, path: "../notes" });
    expect(existsSync(join(result.store, ".git"))).toBe(false);
    const config = await Bun.file(join(result.store, "trove.yaml")).text();
    expect(config).toContain("language: ru");
    expect(config).toStartWith(`${SCHEMA_MODELINE}\n`);
    await expect(initStore({ cwd: app, language: "en" })).rejects.toThrow(
      /already has .*trove\.yaml/,
    );
  });

  test("--share writes the committed pointer for teammates", async () => {
    const app = await project("app");
    await initStore({ cwd: app, language: "en", git: false, share: true });
    expect(await readPointer(app)).toMatchObject({ place: "shared" });
    expect(await Bun.file(join(app, ".trove.yaml")).text()).toContain("path: ../app-trove");
  });

  test("a remote turns sync on and becomes origin", async () => {
    const app = await project("app");
    const result = await initStore({ cwd: app, language: "en", remote: "git@example.com:o/r.git" });
    expect(await Bun.file(join(result.store, "trove.yaml")).text()).toContain("sync: push");
    expect((await git(result.store, ["remote", "get-url", "origin"])).out).toBe(
      "git@example.com:o/r.git",
    );
  });
});

describe("locating a store", () => {
  test("from a project subfolder, by scope when there are several", async () => {
    const app = await project("app");
    const main = await initStore({ cwd: app, language: "en", git: false });
    const billing = await initStore({
      cwd: app,
      language: "en",
      git: false,
      append: true,
      name: "billing",
      path: "../billing-trove",
      scope: ["client/billing/**"],
    });
    await mkdir(join(app, "client", "billing", "ui"), { recursive: true });
    await mkdir(join(app, "server"), { recursive: true });

    expect(await locateStore(join(app, "client", "billing", "ui"))).toBe(billing.store);
    expect(await locateStore(app, "main")).toBe(main.store);
    await expect(locateStore(join(app, "server"))).rejects.toThrow(
      /several stores \(main, billing\)/,
    );
  });

  test("from the registry when the project has no pointer", async () => {
    const app = await project("app");
    const { store } = await initStore({ cwd: app, language: "en", git: false });
    await rm(join(app, ".git", "trove.yaml"));
    expect(await locateStore(app)).toBe(store);
    expect(await forgetProject(app)).toBe(true);
    await rm(join(store, "trove.yaml"));
    expect(await locateStore(app)).toBeUndefined();
  });

  test("a store next to the project whose roots name it, with no pointer and no registry", async () => {
    const app = await project("app");
    const { store } = await initStore({ cwd: app, language: "en", git: false });
    await rm(join(app, ".git", "trove.yaml"));
    await forgetProject(app);
    await mkdir(join(workspace, "unrelated-trove"), { recursive: true });
    await Bun.write(
      join(workspace, "unrelated-trove", "trove.yaml"),
      "roots: { other: ../other }\n",
    );
    expect(await locateStore(join(app))).toBe(store);
    expect((await diagnose(app)).stores.map((entry) => entry.root)).toEqual([store]);
  });

  test("doctor inside a store finds it and the project the registry ties it to", async () => {
    const app = await project("app");
    const { store } = await initStore({ cwd: app, language: "en", git: false });
    await rm(join(app, ".git", "trove.yaml"));
    const health = await diagnose(join(store, "audits"));
    expect(samePath(health.project, app)).toBe(true);
    expect(health.registered).toBe(true);
    expect(health.stores).toHaveLength(1);
    expect(health.stores[0]).toMatchObject({ present: true, errors: 0 });

    await forgetProject(app);
    const alone = await diagnose(store);
    expect(alone.registered).toBe(false);
    expect(samePath(alone.stores[0]?.root ?? "", store)).toBe(true);
  });
});

describe("clone", () => {
  test("by the store's address, linked privately next to the project", async () => {
    const app = await project("app");
    const origin = await initStore({ cwd: app, language: "en" });
    const colleague = join(workspace, "colleague", "app");
    await mkdir(colleague, { recursive: true });
    await git(colleague, ["init", "--quiet"]);
    process.env.TROVE_HOME = join(workspace, "home3");

    const remote = origin.store.replaceAll("\\", "/");
    expect(await cloneStore({ cwd: colleague, remote })).toMatchObject({ action: "cloned" });
    const cloned = join(workspace, "colleague", "app-trove");
    expect(existsSync(join(cloned, "trove.yaml"))).toBe(true);
    expect(existsSync(join(colleague, ".trove.yaml"))).toBe(false);
    expect(await readPointer(colleague)).toMatchObject({
      place: "private",
      stores: [{ name: "main", path: "../app-trove", remote }],
    });
    expect(samePath((await locateStore(colleague)) ?? "", cloned)).toBe(true);
  });

  test("brings the stores of a pointer onto another machine", async () => {
    const app = await project("app");
    const origin = await initStore({ cwd: app, language: "en" });
    await Bun.write(
      join(app, ".trove.yaml"),
      `stores:\n  - name: main\n    path: ../app-trove\n    remote: ${origin.store.replaceAll("\\", "/")}\n`,
    );

    const colleague = join(workspace, "colleague", "app");
    await mkdir(colleague, { recursive: true });
    await cp(join(app, ".trove.yaml"), join(colleague, ".trove.yaml"));
    process.env.TROVE_HOME = join(workspace, "home2");

    expect((await cloneStores(colleague)).map((r) => r.action)).toEqual(["cloned"]);
    expect((await cloneStores(colleague)).map((r) => r.action)).toEqual(["found"]);
    const health = await diagnose(colleague);
    expect(health.registered).toBe(true);
    expect(health.stores[0]).toMatchObject({ present: true, errors: 0, documents: 0 });
  });

  test("explains a store that has no remote and is not on disk", async () => {
    const app = await project("app");
    await Bun.write(join(app, ".trove.yaml"), "stores:\n  - name: main\n    path: ../gone\n");
    await expect(cloneStores(app)).rejects.toThrow(/has no remote to clone/);
    expect((await diagnose(app)).stores[0]?.problem).toMatch(/run trove clone/);
  });
});

describe("listing documents", () => {
  test("ignore takes file names anywhere and path globs", async () => {
    const root = await mkdtemp(join(tmpdir(), "trove-walk-"));
    for (const rel of [
      "CONTRIBUTING.md",
      "notes/day.md",
      "plans/PLAN_A.md",
      "plans/CONTRIBUTING.md",
    ]) {
      await Bun.write(join(root, rel), "x");
    }
    const config = parseConfig(
      "regulation: 1\nstatuses: { archived: archived }\ntypes: {}\nignore: [CONTRIBUTING.md, notes/**]\n",
      "inline",
    );
    expect(await listDocuments(root, config)).toEqual(["plans/PLAN_A.md"]);
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  });
});

describe("paths through a symlink", () => {
  test("the repository root keeps the caller's spelling and paths compare by target", async () => {
    const real = await mkdtemp(join(tmpdir(), "trove-real-"));
    const alias = `${real}-alias`;
    await symlink(real, alias, "junction");
    await git(real, ["init", "-q"]);
    await mkdir(join(real, "sub"));
    expect(await toplevel(join(alias, "sub"))).toBe(alias);
    expect(samePath(alias, real)).toBe(true);
    expect(isInside(alias, join(real, "sub"))).toBe(true);
    await rm(alias, { recursive: false, force: true, maxRetries: 5 });
    await rm(real, { recursive: true, force: true, maxRetries: 5 });
  });
});
