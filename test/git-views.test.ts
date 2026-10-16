import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../src/core/git/git.ts";
import { fillLiveBlocks } from "../src/core/live/fill.ts";
import { withGitData } from "../src/core/live/git-data.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { addItem } from "../src/core/ops/item-add.ts";
import { closeItem } from "../src/core/ops/item-close.ts";
import { moveItem } from "../src/core/ops/item-move.ts";
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

const copySandbox = async (roots: string, root = join(workspace, "store")): Promise<string> => {
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
    await git(app, ["switch", "--quiet", "-c", "feature/c", "main"]);
    await commitOn(app, "c", "2026-09-20");
    await git(app, ["switch", "--quiet", "-c", "feature/d", "main"]);
    await commitOn(app, "d", "2026-09-22");
    await commitOn(app, "d remote", "2026-09-23");
    await git(app, ["switch", "--quiet", "-c", "feature/e", "main"]);
    await commitOn(app, "e", "2026-09-25");
    await git(app, ["merge", "--quiet", "--no-ff", "--no-edit", "develop"], {
      env: { GIT_AUTHOR_DATE: "2026-09-26T12:00:00Z", GIT_COMMITTER_DATE: "2026-09-26T12:00:00Z" },
    });
    await git(app, ["branch", "feature/old", "main"]);
    await git(app, ["switch", "--quiet", "-c", "other", "main"]);
    await commitOn(app, "other", "2026-10-05");
    await git(app, ["remote", "add", "origin", origin]);
    const pushed = ["main", "develop", "feature/b", "feature/c", "feature/d", "feature/old"];
    await git(app, ["push", "--quiet", "origin", ...pushed]);
    await git(app, ["switch", "--quiet", "feature/c"]);
    await commitOn(app, "c local", "2026-09-21");
    await git(app, ["switch", "--quiet", "feature/d"]);
    await git(app, ["reset", "--quiet", "--hard", "HEAD~1"]);
    await commitOn(app, "d local", "2026-09-24");
    await git(app, ["fetch", "--quiet", "origin"]);
    const root = await copySandbox("app: ../app\n  gone: ../gone");
    store = await openStore({ cwd: root, store: root, today: "2026-10-15" });
  });

  test("each branch once, with its own commits and those not in each base, newest first", async () => {
    const text = block(
      "<!-- trove:branches root=app pattern=feature/* against=origin/develop,origin/main -->",
    );
    const { text: filled, problems } = await fill(store.index, text);
    expect(problems).toEqual([]);
    expect(filled).toContain(
      [
        "| branch | own | origin/develop | origin/main | last commit |",
        "| ------ | --- | -------------- | ----------- | ----------- |",
        "| origin/feature/b | 1 | 1 | 1 | 2026-10-01 |",
        "| feature/e | 2 | 2 | 3 | 2026-09-26 |",
        "| origin/feature/d (local diverged) | 2 | 2 | 2 | 2026-09-23 |",
        "| feature/c (local ahead 1) | 2 | 2 | 2 | 2026-09-21 |",
        "| feature/a | 2 | 2 | 2 | 2026-09-12 |",
        "<!-- /trove:branches -->",
      ].join("\n"),
    );
    expect(filled).not.toContain("other");
  });

  test("merged= shows branches merged into every base, or every branch", async () => {
    const merged = await fill(
      store.index,
      block("<!-- trove:branches root=app pattern=feature/* against=origin/main merged=true -->"),
    );
    expect(merged.text).toContain("| origin/feature/old | 0 | 0 | 2026-09-01 |\n<!-- /trove");
    const any = await fill(
      store.index,
      block("<!-- trove:branches root=app pattern=feature/* against=origin/main merged=any -->"),
    );
    expect(any.text).toContain("| origin/feature/b |");
    expect(any.text).toContain("| origin/feature/old |");
    const wrong = await fill(store.index, block("<!-- trove:branches root=app merged=no -->"));
    expect(wrong.problems[0]?.message).toBe("merged=no: use false, true or any");
  });

  test("active= hides branches whose last commit is older than the span", async () => {
    const names = async (active: string) => {
      const { text, problems } = await fill(
        store.index,
        block(`<!-- trove:branches root=app pattern=feature/* active=${active} -->`),
      );
      expect(problems).toEqual([]);
      return [...text.matchAll(/^\| (\S+)/gm)].map((match) => match[1]).slice(2);
    };
    expect(await names("3w")).toEqual(["origin/feature/b", "feature/e"]);
    expect(await names("22d")).toEqual(["origin/feature/b", "feature/e", "origin/feature/d"]);
    expect(await names("2m")).toContain("origin/feature/old");
    const wrong = await fill(store.index, block("<!-- trove:branches root=app active=soon -->"));
    expect(wrong.problems[0]?.message).toMatch(/^active=soon: give days, weeks or months/);
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
    const moving = await open("2026-10-16");
    await applyPlan(moving, await moveItem(moving.index, "API2-3", "AUDIT_MOBILE_1"));
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
        "| moved | API2-3 | [AUDIT_MOBILE_1](../audits/mobile/AUDIT_MOBILE_1.md) | [AUDIT_API_2](../audits/AUDIT_API_2.md) |",
        "| moved | API2-4 | [AUDIT_MOBILE_1](../audits/mobile/AUDIT_MOBILE_1.md) | [AUDIT_API_2](../audits/AUDIT_API_2.md) |",
        "<!-- /trove:changes -->",
      ].join("\n"),
    );
    const outcome = await applyPlan(store, plan);
    expect(outcome.introduced).toEqual([]);
  });

  test("an item moved to a new id says where it went and is not listed as added", async () => {
    const store = await open();
    const moved = await fill(
      store.index,
      block(`<!-- trove:changes since=${base} id=API2-3,MOB1-4 columns=change,id,to,document -->`),
    );
    expect(moved.text).toContain(
      "| moved | API2-3 | MOB1-4 | [AUDIT_MOBILE_1](audits/mobile/AUDIT_MOBILE_1.md) |\n<!--",
    );
  });

  test("grouped by change in their order, or counted per change and per document", async () => {
    const store = await open();
    const grouped = await fill(
      store.index,
      block(`<!-- trove:changes since=${base} group=change as=ids -->`),
    );
    expect(grouped.text).toContain(
      "**closed**\n\nAPI2-1\n\n**added**\n\nAPI2-5\n\n**moved**\n\nAPI2-3, API2-4\n",
    );
    const counts = await fill(store.index, block(`<!-- trove:changes since=${base} as=counts -->`));
    expect(counts.text).toContain(
      [
        "| change | count |",
        "| ------ | ----- |",
        "| closed | 1 |",
        "| added | 1 |",
        "| moved | 2 |",
      ].join("\n"),
    );
    const byDocument = await fill(
      store.index,
      block(`<!-- trove:changes since=${base} as=counts by=document label=audit -->`),
    );
    expect(byDocument.text).toContain(
      [
        "| audit | closed | added | moved |",
        "| ----- | ------ | ----- | ----- |",
        "| [AUDIT_API_2.RESOLVED](audits/AUDIT_API_2.RESOLVED.md) | 1 | 0 | 0 |",
        "| [AUDIT_API_2](audits/AUDIT_API_2.md) | 0 | 1 | 0 |",
        "| [AUDIT_MOBILE_1](audits/mobile/AUDIT_MOBILE_1.md) | 0 | 0 | 2 |",
      ].join("\n"),
    );
  });

  test("counts grouped alone give a row per group; with by, a table per group", async () => {
    const store = await open();
    const perDocument = await fill(
      store.index,
      block(`<!-- trove:changes since=${base} as=counts group=document -->`),
    );
    expect(perDocument.text).toContain(
      [
        "| document | closed | added | moved |",
        "| -------- | ------ | ----- | ----- |",
        "| [AUDIT_API_2.RESOLVED](audits/AUDIT_API_2.RESOLVED.md) | 1 | 0 | 0 |",
        "| [AUDIT_API_2](audits/AUDIT_API_2.md) | 0 | 1 | 0 |",
        "| [AUDIT_MOBILE_1](audits/mobile/AUDIT_MOBILE_1.md) | 0 | 0 | 2 |",
      ].join("\n"),
    );
    const perChange = await fill(
      store.index,
      block(`<!-- trove:changes since=${base} as=counts group=change by=owner -->`),
    );
    expect(perChange.text).toContain(
      [
        "**closed**",
        "",
        "| owner | closed |",
        "| ----- | ------ |",
        "| api | 1 |",
        "",
        "**added**",
      ].join("\n"),
    );
    expect(perChange.text).toContain("**moved**\n\n| owner | moved |\n");
  });

  test("an item closed into a document of another type matches filters on where it was", async () => {
    const store = await open();
    const audits = await fill(
      store.index,
      block(`<!-- trove:changes since=${base} type=audit group=change as=ids -->`),
    );
    expect(audits.text).toContain(
      "**closed**\n\nAPI2-1\n\n**added**\n\nAPI2-5\n\n**moved**\n\nAPI2-3, API2-4\n",
    );
    const resolved = await fill(
      store.index,
      block(`<!-- trove:changes since=${base} type=resolved as=ids -->`),
    );
    expect(resolved.text).toContain("-->\nAPI2-1\n<!--");
  });

  test("previous is the summary dated before, not one written the same day", async () => {
    await git(root, ["add", "--all"]);
    await commitOn(root, "docs: first summary", "2026-10-20");
    const store = await open();
    const plan = await newSummary(store.index, {
      kind: "web",
      keep: true,
      name: "WEB_2026-10-20_B",
    });
    expect(plan.changes[0]?.text).toContain("| closed | API2-1 |");
    const nextDay = await open("2026-10-21");
    const later = await fill(
      nextDay.index,
      `---\nkind: web\ndate: 2026-10-21\n---\n${block("<!-- trove:changes -->")}`,
    );
    expect(later.text).toContain("<!-- trove:changes -->\nno changes\n");
  });

  test("a summary replacing one of the same day starts from that one", async () => {
    const store = await open();
    const plan = await newSummary(store.index, { kind: "web", name: "WEB_2026-10-20_DRY" });
    expect(plan.changes.map((change) => change.rel)).toContain(
      ".archive/summaries/SUMMARY_WEB_2026-10-20.md",
    );
    expect(plan.changes[0]?.text).toContain(
      "columns=change,id,document,from -->\nno changes\n<!--",
    );
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
    expect(byCommit.text).toContain("API2-1, API2-5, API2-3, API2-4");
  });

  test("before the history the store's first commit is the start; no previous summary shows nothing", async () => {
    const store = await open();
    const early = await fill(store.index, block("<!-- trove:changes since=2020-01-01 as=ids -->"));
    expect(early.text).toContain(
      `base moved to ${base.slice(0, 7)} 2026-10-15: the store did not exist on 2020-01-01\n\nAPI2-1, API2-5, API2-3, API2-4\n`,
    );
    const first = await fill(
      store.index,
      `---\nkind: none-yet\ndate: 2026-10-20\n---\n${block("<!-- trove:changes -->")}`,
    );
    expect(first.text).toContain("<!-- trove:changes -->\n—\n");
  });

  test("since a date follows the main line, not an older commit of a merged branch", async () => {
    const repo = join(workspace, "merged");
    await mkdir(repo);
    await git(repo, ["init", "--quiet", "--initial-branch=main"]);
    await Bun.write(join(repo, "code.txt"), "code\n");
    await git(repo, ["add", "--all"]);
    await commitOn(repo, "code", "2026-10-01");
    await git(repo, ["branch", "feature"]);
    const docs = await copySandbox("harbor: ../harbor", join(repo, "docs"));
    await git(repo, ["add", "--all"]);
    await commitOn(repo, "docs: base", "2026-10-10");
    const docsBase = (await git(repo, ["rev-parse", "HEAD"])).out;
    await git(repo, ["switch", "--quiet", "feature"]);
    await Bun.write(join(repo, "feature.txt"), "feature\n");
    await git(repo, ["add", "--all"]);
    await commitOn(repo, "feature", "2026-10-14");
    await git(repo, ["switch", "--quiet", "main"]);
    await git(repo, ["merge", "--quiet", "--no-ff", "--no-edit", "feature"], {
      env: { GIT_AUTHOR_DATE: "2026-10-16T12:00:00Z", GIT_COMMITTER_DATE: "2026-10-16T12:00:00Z" },
    });
    const before = await openStore({ cwd: docs, store: docs, today: "2026-10-17" });
    await applyPlan(before, await closeItem(before.index, "API2-1"));
    const store = await openStore({ cwd: docs, store: docs, today: "2026-10-17" });
    const ids = (since: string) =>
      fill(store.index, block(`<!-- trove:changes since=${since} group=change as=ids -->`));
    const byDate = await ids("2026-10-15");
    expect(byDate.text).toContain("**closed**\n\nAPI2-1\n");
    expect(byDate.text.replace("2026-10-15", "")).toBe(
      (await ids(docsBase)).text.replace(docsBase, ""),
    );
  });

  test("a start before the store came in moves to its first commit; archived items are closed", async () => {
    const repo = join(workspace, "migrated");
    await mkdir(repo);
    await git(repo, ["init", "--quiet", "--initial-branch=main"]);
    const docs = await copySandbox("harbor: ../harbor", join(repo, "docs"));
    const config = await Bun.file(join(docs, "trove.yaml")).text();
    await rm(join(docs, "trove.yaml"));
    await git(repo, ["add", "--all"]);
    await commitOn(repo, "docs: old layout", "2026-10-01");
    await Bun.write(join(docs, "trove.yaml"), config);
    await git(repo, ["add", "--all"]);
    await commitOn(repo, "docs: trove", "2026-10-08");
    const first = (await git(repo, ["rev-parse", "--short=7", "HEAD"])).out;
    await mkdir(join(docs, ".archive/audits"), { recursive: true });
    await rename(join(docs, "audits/AUDIT_WEB_1.md"), join(docs, ".archive/audits/AUDIT_WEB_1.md"));
    const store = await openStore({ cwd: docs, store: docs, today: "2026-10-21" });
    const { text, problems } = await fill(
      store.index,
      block("<!-- trove:changes since=2026-10-05 group=change as=ids -->"),
    );
    expect(problems).toEqual([]);
    expect(text).toContain(
      [
        `base moved to ${first} 2026-10-08: the store did not exist on 2026-10-05`,
        "",
        "**closed**",
        "",
        "WEB1-1, WEB1-2, WEB1-3, WEB1-4, WEB1-5, WEB1-6, WEB1-7, WEB1-8",
        "<!-- /trove:changes -->",
      ].join("\n"),
    );
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

describe("trend", () => {
  let store: Store;

  const commitAll = async (repo: string, message: string, date: string) => {
    await git(repo, ["add", "--all"]);
    await commitOn(repo, message, date);
  };

  beforeAll(async () => {
    const root = await copySandbox("harbor: ../harbor", join(workspace, "trend"));
    const on = (today: string) => openStore({ cwd: root, store: root, today });
    await git(root, ["init", "--quiet", "--initial-branch=main"]);
    await commitAll(root, "docs: base", "2026-10-02");
    const closing = await on("2026-10-07");
    await applyPlan(closing, await closeItem(closing.index, "API2-1"));
    await commitAll(root, "docs: close API2-1", "2026-10-07");
    const adding = await on("2026-10-13");
    await applyPlan(
      adding,
      addItem(adding.index, {
        document: "AUDIT_API_2",
        values: { priority: "P2", owner: "api", what: "Rate limits are per process" },
      }),
    );
    await commitAll(root, "docs: add API2-5", "2026-10-13");
    const uncommitted = await on("2026-10-21");
    await applyPlan(uncommitted, await closeItem(uncommitted.index, "MOB1-1"));
    store = await on("2026-10-21");
  });

  test("items opened and closed each week and open at its end, from the ledgers' history", async () => {
    const { text, problems } = await fill(store.index, block("<!-- trove:trend weeks=3 -->"));
    expect(problems).toEqual([]);
    expect(text).toContain(
      [
        "| week | opened | closed | moved | open at end |",
        "| ---- | ------ | ------ | ----- | ----------- |",
        "| 2026-10-05 | 0 | 1 | 0 | 17 |",
        "| 2026-10-12 | 1 | 0 | 0 | 18 |",
        "| 2026-10-19 | 0 | 1 | 0 | 17 |",
        "<!-- /trove:trend -->",
      ].join("\n"),
    );
  });

  test("by a field, filtered like items, with a row per week and value", async () => {
    const { text } = await fill(
      store.index,
      block("<!-- trove:trend weeks=2 owner=api by=priority label=P -->"),
    );
    expect(text).toContain(
      [
        "| week | P | opened | closed | moved | open at end |",
        "| ---- | - | ------ | ------ | ----- | ----------- |",
        "| 2026-10-12 | P1 | 0 | 0 | 0 | 1 |",
        "| 2026-10-12 | P2 | 1 | 0 | 0 | 2 |",
        "| 2026-10-19 | P1 | 0 | 0 | 0 | 1 |",
        "| 2026-10-19 | P2 | 0 | 0 | 0 | 2 |",
        "<!-- /trove:trend -->",
      ].join("\n"),
    );
    const wrong = await fill(store.index, block("<!-- trove:trend weeks=x -->"));
    expect(wrong.problems[0]?.message).toBe("weeks=x: give a number of weeks from 1 to 104");
  });

  test("by a field the ledger lacks: the document's field, else the fallback", async () => {
    const owners = async (args: string) =>
      (await fill(store.index, block(`<!-- trove:trend weeks=1 type=debt by=owner ${args}-->`)))
        .text;
    expect(await owners("")).toContain("| 2026-10-19 | — | 0 | 0 | 0 | 3 |");
    expect(await owners("fallback=section ")).toContain(
      "| 2026-10-19 | Infra | 0 | 0 | 0 | 1 |\n| 2026-10-19 | Server | 0 | 0 | 0 | 2 |",
    );
    const debt = Bun.file(join(store.root, "DEBT.md"));
    await Bun.write(debt, (await debt.text()).replace("type: debt\n", "type: debt\nowner: core\n"));
    const reopened = await openStore({ cwd: store.root, store: store.root, today: "2026-10-21" });
    const { text } = await fill(
      reopened.index,
      block("<!-- trove:trend weeks=1 type=debt by=owner fallback=section -->"),
    );
    expect(text).toContain("| 2026-10-19 | core | 0 | 0 | 0 | 3 |");
  });

  test("the week the store came in shows what it started with; moves and archiving count apart", async () => {
    const repo = join(workspace, "imported");
    await mkdir(repo);
    await git(repo, ["init", "--quiet", "--initial-branch=main"]);
    await Bun.write(join(repo, "code.txt"), "code\n");
    await commitAll(repo, "code", "2026-09-20");
    const docs = await copySandbox("harbor: ../harbor", join(repo, "docs"));
    await commitAll(repo, "docs: import", "2026-10-08");
    const on = () => openStore({ cwd: docs, store: docs, today: "2026-10-21" });
    const moving = await on();
    await applyPlan(moving, await moveItem(moving.index, "API2-3", "AUDIT_MOBILE_1"));
    await commitAll(repo, "docs: move API2-3", "2026-10-14");
    await mkdir(join(docs, ".archive/audits"), { recursive: true });
    await rename(join(docs, "audits/AUDIT_WEB_1.md"), join(docs, ".archive/audits/AUDIT_WEB_1.md"));
    const store = await on();
    const trend = async (filter: string) => {
      const { text, problems } = await fill(
        store.index,
        block(`<!-- trove:trend weeks=4${filter} -->`),
      );
      expect(problems).toEqual([]);
      return text;
    };
    expect(await trend("")).toContain(
      [
        "| week | opened | closed | moved | open at end |",
        "| ---- | ------ | ------ | ----- | ----------- |",
        "| 2026-10-05 (at start) | — | — | — | 18 |",
        "| 2026-10-12 | 0 | 0 | 1 | 18 |",
        "| 2026-10-19 | 0 | 8 | 0 | 10 |",
        "<!-- /trove:trend -->",
      ].join("\n"),
    );
    expect(await trend(" path=!**/mobile/**")).toContain(
      [
        "| 2026-10-05 (at start) | — | — | — | 15 |",
        "| 2026-10-12 | 0 | 0 | 1 | 14 |",
        "| 2026-10-19 | 0 | 8 | 0 | 6 |",
      ].join("\n"),
    );
    expect(await trend(" path=audits/AUDIT_WEB_1.md")).toContain(
      "| 2026-10-12 | 0 | 0 | 0 | 8 |\n| 2026-10-19 | 0 | 8 | 0 | 0 |",
    );
  });
});
