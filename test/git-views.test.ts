import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../src/core/git/git.ts";
import { fillLiveBlocks } from "../src/core/live/fill.ts";
import { withGitData } from "../src/core/live/git-data.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { addItem } from "../src/core/ops/item-add.ts";
import { closeItem } from "../src/core/ops/item-close.ts";
import { newSummary } from "../src/core/summaries/summaries.ts";
import { openStore, type Store, type StoreIndex } from "../src/index.ts";
import { ROOT } from "./helpers.ts";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

let workspace = "";

const commitOn = (dir: string, message: string, date: string) => {
  const at = `${date}T12:00:00Z`;
  return git(dir, ["commit", "--quiet", "--allow-empty", "-m", message], {
    env: { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at },
  });
};

const block = (open: string) =>
  `${open}\nstale\n<!-- /trove:${open.match(/trove:(\w+)/)?.[1]} -->\n`;

/** Fills a text the index does not hold yet, reading the git data its blocks need first. */
const fill = async (index: StoreIndex, text: string, rel = "NOTES.md") =>
  fillLiveBlocks(text, rel, await withGitData(index, [{ rel, text }]));

const copySandbox = async (roots: string): Promise<string> => {
  const root = join(workspace, "store");
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  const config = Bun.file(join(root, "trove.yaml"));
  await Bun.write(config, (await config.text()).replace("harbor: ../harbor", roots));
  return root;
};

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-git-views-"));
  Object.assign(process.env, IDENTITY);
});

afterAll(() => rm(workspace, { recursive: true, force: true, maxRetries: 5 }));

describe("branches", () => {
  let store: Store;

  beforeAll(async () => {
    const app = join(workspace, "app");
    const origin = join(workspace, "origin.git");
    await mkdir(app);
    await git(workspace, ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
    await git(app, ["init", "--quiet", "--initial-branch=main"]);
    await commitOn(app, "base", "2026-09-01");
    await git(app, ["switch", "--quiet", "-c", "develop"]);
    await commitOn(app, "develop", "2026-09-05");
    await git(app, ["switch", "--quiet", "-c", "feature/a", "main"]);
    await commitOn(app, "a one", "2026-09-10");
    await commitOn(app, "a two", "2026-09-12");
    await git(app, ["switch", "--quiet", "-c", "feature/b", "main"]);
    await commitOn(app, "b", "2026-10-01");
    await git(app, ["switch", "--quiet", "-c", "other", "main"]);
    await commitOn(app, "other", "2026-10-05");
    await git(app, ["remote", "add", "origin", origin]);
    await git(app, ["push", "--quiet", "origin", "main", "develop", "feature/b"]);
    await git(app, ["fetch", "--quiet", "origin"]);
    const root = await copySandbox("app: ../app\n  gone: ../gone");
    store = await openStore({ cwd: root, store: root, today: "2026-10-15" });
  });

  test("branches matching the pattern, with commits not in each base, newest first", async () => {
    const text = block(
      "<!-- trove:branches root=app pattern=feature/* against=origin/develop,origin/main -->",
    );
    const { text: filled, problems } = await fill(store.index, text);
    expect(problems).toEqual([]);
    expect(filled).toContain(
      [
        "| branch | origin/develop | origin/main | last commit |",
        "| ------ | -------------- | ----------- | ----------- |",
        "| feature/b | 1 | 1 | 2026-10-01 |",
        "| origin/feature/b | 1 | 1 | 2026-10-01 |",
        "| feature/a | 2 | 2 | 2026-09-12 |",
      ].join("\n"),
    );
    expect(filled).not.toContain("other");
  });

  test("an unknown root or base is a block problem", async () => {
    const root = await fill(store.index, block("<!-- trove:branches root=nope -->"));
    expect(root.problems[0]?.message).toBe("no root nope; known: app, gone");
    const base = await fill(
      store.index,
      block("<!-- trove:branches root=app against=origin/x -->"),
    );
    expect(base.problems[0]?.message).toBe("no origin/x in root app");
  });

  test("a root not checked out here leaves the block as it is", async () => {
    const text = block("<!-- trove:branches root=gone -->");
    expect(await fill(store.index, text)).toEqual({ text, problems: [] });
  });

  test("blocks in documents are filled from the git data read when the store opens", async () => {
    const rel = "RISKS.md";
    const path = join(store.root, rel);
    await Bun.write(
      path,
      `${await Bun.file(path).text()}\n${block("<!-- trove:branches root=app pattern=other -->")}`,
    );
    const reopened = await openStore({ cwd: store.root, store: store.root, today: "2026-10-15" });
    const doc = reopened.index.byRel.get(rel);
    expect(doc && fillLiveBlocks(doc.text, rel, reopened.index).text).toContain(
      "| other | 2026-10-05 |",
    );
  });
});

describe("changes", () => {
  let root = "";
  let base = "";
  const open = (today = "2026-10-20") => openStore({ cwd: root, store: root, today });

  beforeAll(async () => {
    root = await copySandbox("harbor: ../harbor");
    const template = Bun.file(join(root, ".trove/templates/web.md"));
    await Bun.write(
      template,
      `${await template.text()}\n## Since the last summary\n\n${block("<!-- trove:changes since=previous columns=change,id,document,from -->")}`,
    );
    await git(root, ["init", "--quiet", "--initial-branch=main"]);
    await git(root, ["add", "--all"]);
    await commitOn(root, "docs: base", "2026-10-15");
    base = (await git(root, ["rev-parse", "HEAD"])).out;

    const store = await open("2026-10-16");
    await applyPlan(store, await closeItem(store.index, "API2-1"));
    const after = await open("2026-10-16");
    await applyPlan(
      after,
      addItem(after.index, {
        document: "AUDIT_API_2",
        values: { priority: "P2", owner: "api", what: "Search results leak private channels" },
      }),
    );
    const api = Bun.file(join(root, "audits/AUDIT_API_2.md"));
    const mobile = Bun.file(join(root, "audits/mobile/AUDIT_MOBILE_1.md"));
    const row = (await api.text()).split("\n").find((line) => line.startsWith("| API2-4 |")) ?? "";
    await Bun.write(api, (await api.text()).replace(`${row}\n`, ""));
    const moved = "| API2-4 | P2 | db | infra | open | Database backups are not restore-tested |";
    const mobileText = await mobile.text();
    const last = mobileText.split("\n").findLast((line) => line.startsWith("| MOB1-")) ?? "";
    await Bun.write(mobile, mobileText.replace(last, `${last}\n${moved}`));
  });

  test("a new summary lists what was closed, added and moved since the previous one", async () => {
    const store = await open();
    const plan = await newSummary(store.index, { kind: "web" });
    const text = plan.changes[0]?.text ?? "";
    expect(text).toContain(
      [
        "| change | id | document | from |",
        "| ------ | -- | -------- | ---- |",
        "| closed | API2-1 | [AUDIT_API_2.RESOLVED](../audits/AUDIT_API_2.RESOLVED.md) | — |",
        "| added | API2-5 | [AUDIT_API_2](../audits/AUDIT_API_2.md) | — |",
        "| moved | API2-4 | [AUDIT_MOBILE_1](../audits/mobile/AUDIT_MOBILE_1.md) | [AUDIT_API_2](../audits/AUDIT_API_2.md) |",
      ].join("\n"),
    );
    const outcome = await applyPlan(store, plan);
    expect(outcome.introduced).toEqual([]);
  });

  test("since a date or a commit, filtered and laid out like items", async () => {
    const store = await open();
    const byDate = await fill(
      store.index,
      block('<!-- trove:changes since=2026-10-16 owner=api as=list format="{change} {id}" -->'),
    );
    expect(byDate.problems).toEqual([]);
    expect(byDate.text).toContain("- closed API2-1\n- added API2-5\n");
    expect(byDate.text).not.toContain("API2-4");
    const byCommit = await fill(store.index, block(`<!-- trove:changes since=${base} as=ids -->`));
    expect(byCommit.text).toContain("API2-1, API2-5, API2-4");
  });

  test("before the history every item is new; no previous summary shows nothing", async () => {
    const store = await open();
    const early = await fill(store.index, block("<!-- trove:changes since=2020-01-01 as=ids -->"));
    expect(early.text).toContain("API2-2");
    const first = await fill(
      store.index,
      `---\nkind: none-yet\ndate: 2026-10-20\n---\n${block("<!-- trove:changes -->")}`,
    );
    expect(first.text).toContain("<!-- trove:changes -->\n—\n");
  });

  test("an unknown starting point or a summary without a kind is a block problem", async () => {
    const store = await open();
    const unknown = await fill(store.index, block("<!-- trove:changes since=nope -->"));
    expect(unknown.problems[0]?.message).toBe(
      "since=nope: give previous, a date or a commit of the store",
    );
    const kindless = await fill(store.index, block("<!-- trove:changes -->"));
    expect(kindless.problems[0]?.message).toMatch(/needs a summary with a kind/);
  });
});
