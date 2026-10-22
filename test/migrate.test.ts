import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import { git } from "../src/core/git/git.ts";
import { inferConfig } from "../src/core/migrate/infer.ts";
import { migrateArchive } from "../src/core/migrate/migrate.ts";
import { openStore, parseConfig, runRules } from "../src/index.ts";
import { captureIo, ROOT } from "./helpers.ts";

let workspace = "";
let archive = "";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

/** The sandbox without its config, kept in git, with some work left uncommitted. */
const handKeptArchive = async (): Promise<string> => {
  const root = join(workspace, "notes");
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  await rm(join(root, "trove.yaml"));
  await Bun.write(join(root, "lint.mjs"), "// the old checker\n");
  await git(root, ["init", "--quiet"]);
  await git(root, ["add", "--all"]);
  await git(root, ["commit", "--quiet", "-m", "docs: history"]);
  await Bun.write(join(root, "research", "RESEARCH_NEW.md"), "draft, not a document yet\n");
  await rm(join(root, "AGENTS.md"));
  return root;
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-migrate-"));
  Object.assign(process.env, IDENTITY, { TROVE_HOME: join(workspace, "home") });
  archive = await handKeptArchive();
});

afterEach(async () => {
  delete process.env.TROVE_HOME;
  await rm(workspace, { recursive: true, force: true, maxRetries: 5 });
});

describe("migrate", () => {
  test("keeps history, carries uncommitted work and loses nothing", async () => {
    const result = await migrateArchive({
      cwd: workspace,
      source: "notes",
      target: "notes-trove",
      drop: ["lint.mjs"],
    });
    const target = join(workspace, "notes-trove");

    expect(result.history).toBe(true);
    expect(result.uncommitted.toSorted()).toEqual(["AGENTS.md", "research/RESEARCH_NEW.md"]);
    expect(result.dropped).toEqual(["lint.mjs"]);
    expect(result.lost).toEqual([]);
    expect(result.inventory.documents).toBe(22);
    expect(result.diagnostics.filter((d) => d.severity === "error").map((d) => d.file)).toEqual([
      "research/RESEARCH_NEW.md",
    ]);

    const log = (await git(target, ["log", "--format=%s"])).out.split("\n");
    expect(log).toEqual([
      "trove: migrate from notes",
      "docs: uncommitted work from notes at migration",
      "docs: history",
    ]);
    expect(existsSync(join(target, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(target, "lint.mjs"))).toBe(false);
    expect((await git(target, ["remote"])).out).toBe("");
    expect(existsSync(join(target, ".git", "hooks", "pre-commit"))).toBe(true);
  });

  test("only reads the archive", async () => {
    const index = join(archive, ".git", "index");
    const before = {
      status: (await git(archive, ["status", "--porcelain"])).out,
      mtime: (await stat(index)).mtimeMs,
    };
    await migrateArchive({ cwd: workspace, source: "notes", target: "notes-trove" });
    expect((await stat(index)).mtimeMs).toBe(before.mtime);
    expect((await git(archive, ["status", "--porcelain"])).out).toBe(before.status);
    expect(existsSync(join(archive, "trove.yaml"))).toBe(false);
  });

  test("registers the store for a project and links it only on request", async () => {
    const project = join(workspace, "app");
    await git(workspace, ["init", "--quiet", "app"]);
    await migrateArchive({
      cwd: workspace,
      source: "notes",
      target: "notes-trove",
      project: "app",
    });
    expect(existsSync(join(project, ".trove.yaml"))).toBe(false);
    expect(await Bun.file(join(workspace, "notes-trove", "trove.yaml")).text()).toContain(
      "app: ../app",
    );

    await rm(join(workspace, "notes-trove"), { recursive: true, force: true, maxRetries: 5 });
    await migrateArchive({
      cwd: workspace,
      source: "notes",
      target: "notes-trove",
      project: "app",
      link: true,
    });
    expect(await Bun.file(join(project, ".trove.yaml")).text()).toContain("path: ../notes-trove");
  });

  test("leaves the archive's remote off the store, says how to add one and what is unpushed", async () => {
    const origin = join(workspace, "origin.git");
    await git(workspace, ["init", "--quiet", "--bare", origin]);
    await git(archive, ["remote", "add", "origin", origin]);
    await git(archive, ["push", "--quiet", "origin", "HEAD"]);
    await Bun.write(join(archive, "specs", "SPEC_LOCAL.md"), "not pushed\n");
    await git(archive, ["add", "specs/SPEC_LOCAL.md"]);
    await git(archive, ["commit", "--quiet", "-m", "docs: local only"]);

    const io = captureIo(workspace);
    await run(["migrate", "notes", "notes-trove"], io);
    expect((await git(join(workspace, "notes-trove"), ["remote"])).out).toBe("");
    expect(io.stdout()).toContain(`! not pushed to ${origin}: 1 archive commits`);
    expect(io.stdout()).toContain("trove remote add <new-url>");
    expect(io.stdout()).toContain(`trove remote add ${origin}`);
  });

  test("an archive without a remote gets no remote advice", async () => {
    const result = await migrateArchive({ cwd: workspace, source: "notes", target: "notes-trove" });
    expect(result.sourceRemote).toBeUndefined();
  });

  test("refuses a target that is not empty", async () => {
    await Bun.write(join(workspace, "busy", "x.md"), "x");
    await expect(
      migrateArchive({ cwd: workspace, source: "notes", target: "busy" }),
    ).rejects.toThrow(/not empty/);
  });
});

describe("inferConfig", () => {
  test("detects the language and widens the preset to what the documents use", async () => {
    await Bun.write(
      join(archive, "plans", "PLAN_MEMO.md"),
      "---\ntype: memo\nstatus: draft\ndate: 2026-10-01\nchecked: 2026-10-01\nscope: x\nowner: ana\n---\n",
    );
    const inferred = await inferConfig(archive);
    const config = parseConfig(inferred.text, "inferred");
    expect(inferred.language).toBe("en");
    expect(config.types.memo?.capabilities).toEqual(["freshness"]);
    expect(config.statuses.draft).toBe("draft");
    expect(config.fields.owner).toEqual({ required: false, format: "text" });
  });

  test("fits an archive with its own ledger, status keys, no status lines and finished archives", async () => {
    const root = join(workspace, "own-style");
    const ledger = (rows: string) =>
      `<!-- ledger -->\n| id | P | area | status | todo |\n| -- | - | ---- | ------ | ---- |\n${rows}<!-- /ledger -->\n`;
    const head = (type: string, status: string, slug = "REL2") =>
      `---\ntype: ${type}\nstatus: ${status}\ndate: 2026-10-01\nchecked: 2026-10-01\nscope: x\nslug: ${slug}\n---\n\n# T\n\n`;
    await Bun.write(
      join(root, "plans", "PLAN_RELEASE_2.md"),
      head("plan", "active") + ledger("| REL2-1 | P3 | search | deferred | later |\n"),
    );
    await Bun.write(
      join(root, ".archive", "audits", "AUDIT_RELEASE_2.md"),
      head("audit", "closed") + ledger(""),
    );
    await Bun.write(
      join(root, "DEBT.md"),
      head("debt", "current", "DEBT") +
        ledger("| DEBT-5 | P3 | infra | open | base images float |\n"),
    );
    const inferred = await inferConfig(root, "ru");
    const config = parseConfig(inferred.text, "inferred");
    expect(config.ledger?.columns.map((c) => `${c.key}:${c.label}`)).toEqual([
      "id:id",
      "priority:P",
      "area:area",
      "status:status",
      "what:todo",
    ]);
    expect(config.ledger?.open).toEqual(["open"]);
    expect(config.types.plan?.capabilities).toContain("ledger");
    expect(config.types.debt?.capabilities).toEqual(["ledger", "freshness"]);
    expect(config.statuses.open).toBe("open");
    expect(config.archive.finished).toEqual(["closed"]);
    expect(config.fields.slug).toEqual({ required: false, format: "text" });

    const store = join(workspace, "own-style-store");
    await cp(root, store, { recursive: true });
    await Bun.write(join(store, "trove.yaml"), inferred.text);
    const opened = await openStore({ cwd: store, store, today: "2026-10-02" });
    const errors = runRules(opened.rules, opened.index).filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
    expect(opened.index.items.map((item) => item.id)).toEqual(["DEBT-5", "REL2-1"]);
  });

  test("keeps the regulation wider than what the documents happened to use", async () => {
    const root = join(workspace, "narrow");
    const doc = (rel: string, type: string, rows: string) =>
      Bun.write(
        join(root, rel),
        `---\ntype: ${type}\nstatus: open\ndate: 2026-10-01\nchecked: 2026-10-01\nscope: x\nverify: run it\nslug: N1\n---\n\n# T\n\n<!-- ledger -->\n| id | P | area | status | todo |\n| -- | - | ---- | ------ | ---- |\n${rows}<!-- /ledger -->\n`,
      );
    await doc(
      "audits/AUDIT_N_1.md",
      "audit",
      "| N1-1 | P2 | a | open | x |\n| N1-2 | P4 | a | open | y |\n",
    );
    await doc("plans/PLAN_N.md", "plan", "");
    const inferred = await inferConfig(root, "en");
    const config = parseConfig(inferred.text, "inferred");
    const column = (key: string) => config.ledger?.columns.find((c) => c.key === key)?.enum;
    expect(Object.keys(column("priority") ?? {})).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    expect(Object.keys(column("status") ?? {})).toEqual(["open", "deferred"]);
    expect(config.types.audit?.fields.verify?.required).toBe(true);
    expect(config.types.plan?.fields.verify?.required).toBe(true);
    expect(
      Object.values(config.types).filter((type) => type.capabilities.includes("status-line")),
    ).toEqual([]);
    expect(inferred.notes).toContain(
      "ledger priority: P0, P1, P2, P3, P4; widen it in the config if more are allowed",
    );
    expect(inferred.notes).toContain(
      "verify required for audit, plan: every document of these types has it",
    );
  });

  test("reads an id template off a ledger whose documents lack the id fields", async () => {
    const root = join(workspace, "debt");
    await Bun.write(
      join(root, "DEBT.md"),
      "---\ntype: debt\nstatus: current\ndate: 2026-10-01\nchecked: 2026-10-01\nscope: x\n---\n\n# Debt\n\n## Server\n\n<!-- ledger -->\n| id | status | what |\n| -- | ------ | ---- |\n| DEBT-S1 | open | a |\n<!-- /ledger -->\n\n## Infra\n\n<!-- ledger -->\n| id | status | what |\n| -- | ------ | ---- |\n| DEBT-I1 | open | b |\n| DEBT-I2 | open | c |\n<!-- /ledger -->\n",
    );
    const config = parseConfig((await inferConfig(root, "en")).text, "inferred");
    expect(config.types.debt?.ledger?.id).toBe("DEBT-{section}{n}");
    expect(config.types.debt?.ledger?.sections).toEqual({ Server: "S", Infra: "I" });
  });

  test("keeps the group order of the existing backlog", async () => {
    const inferred = await inferConfig(archive);
    const section = parseConfig(inferred.text, "inferred").reports.backlog?.sections[0];
    expect(section?.groupOrder).toEqual(["web", "api", "mobile", "infra", "product"]);
  });
});
