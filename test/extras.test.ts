import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "../src/cli/run.ts";
import { toCsv } from "../src/core/export/csv.ts";
import { parseHunks, touches } from "../src/core/git/hunks.ts";
import { sshHost, webRepo } from "../src/core/git/permalink.ts";
import { resolveLinks } from "../src/core/index/links.ts";
import { selectItems } from "../src/core/index/query.ts";
import { queryRows } from "../src/core/index/rows.ts";
import { renderView } from "../src/core/live/views.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { moveItem } from "../src/core/ops/item-move.ts";
import { recheckItems } from "../src/core/ops/item-recheck.ts";
import { pinDeadLinks } from "../src/core/ops/links-pin.ts";
import { lineDiff } from "../src/core/text/diff.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { captureIo, ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<Store> => {
  const root = await mkdtemp(join(tmpdir(), "trove-extras-"));
  copies.push(root);
  const store = join(root, "store");
  await cp(join(ROOT, "sandbox"), store, { recursive: true });
  return openStore({ cwd: store, store, today: TODAY });
};

const read = (store: Store, rel: string) => Bun.file(join(store.root, rel)).text();

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

describe("item move", () => {
  test("moves the row and the section under the target's next id", async () => {
    const store = await sandbox();
    const plan = await moveItem(store.index, "WEB1-6", "AUDIT_API_2");
    expect(plan.notes).toEqual([
      "WEB1-6 → API2-5",
      "not in the target table, dropped: module",
      "WEB1-6 is still mentioned in audits/mobile/AUDIT_MOBILE_1.md",
    ]);
    const before = await read(store, "audits/AUDIT_API_2.md");
    expect((await applyPlan(store, plan)).introduced).toEqual([]);

    const web = await read(store, "audits/AUDIT_WEB_1.md");
    expect(web).not.toContain("| WEB1-6 |");
    expect(web).not.toContain("### WEB1-6.");
    expect(await read(store, "audits/AUDIT_WEB_1.RESOLVED.md")).toContain(
      "| WEB1-6 | P2 | notifications | product | moved | No agreed rule for which mentions notify on mobile and web at the same time → API2-5 |",
    );
    const api = await read(store, "audits/AUDIT_API_2.md");
    expect(lineDiff(before, api).map((line) => `${line.kind}${line.text}`)).toEqual([
      "+| API2-5 | P2 | product | open | No agreed rule for which mentions notify on mobile and web at the same time |",
      "+",
      "+## API2-5. Which mentions notify on several devices (open)",
      "+",
      "+Web, mobile and email each decide on their own. Needs one rule before WEB1-4 is fixed.",
    ]);
  });

  test("can archive a source left without open items", async () => {
    const store = await sandbox();
    const first = await applyPlan(store, await moveItem(store.index, "MOB1-1", "AUDIT_API_2"));
    expect(first.introduced).toEqual([]);
    const next = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    const refused = await applyPlan(next, await moveItem(next.index, "MOB1-2", "AUDIT_API_2"));
    expect(refused.introduced.map((d) => d.rule)).toEqual(["lifecycle"]);
    const done = await applyPlan(
      next,
      await moveItem(next.index, "MOB1-2", "AUDIT_API_2", { archive: true }),
    );
    expect(done.introduced).toEqual([]);
    expect(
      await Bun.file(join(store.root, ".archive/audits/mobile/AUDIT_MOBILE_1.md")).exists(),
    ).toBe(true);
    expect(
      await Bun.file(
        join(store.root, ".archive/audits/mobile/AUDIT_MOBILE_1.RESOLVED.md"),
      ).exists(),
    ).toBe(true);
  });
});

describe("links", () => {
  test("checks the store always and code only under a root checked out here", async () => {
    const store = await sandbox();
    const web = store.index.byRel.get("audits/AUDIT_WEB_1.md");
    if (!web) throw new Error("no web audit");
    const states = (s: Store) =>
      resolveLinks(s.index, s.index.byRel.get("audits/AUDIT_WEB_1.md") ?? web).map(
        (link) => `${link.kind}:${link.state}`,
      );
    expect(new Set(states(store))).toEqual(new Set(["document:ok", "code:unchecked"]));

    const harbor = join(store.root, "..", "harbor", "web", "src", "composer");
    await mkdir(harbor, { recursive: true });
    await Bun.write(join(harbor, "send.ts"), "export {};\n");
    const reopened = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    const resolved = resolveLinks(
      reopened.index,
      reopened.index.byRel.get("audits/AUDIT_WEB_1.md") ?? web,
    );
    expect(resolved.find((link) => link.target.endsWith("send.ts"))?.state).toBe("ok");
    expect(resolved.find((link) => link.target.endsWith("threads.ts"))?.state).toBe("dead");

    const warnings = runRules(reopened.rules, reopened.index).filter((d) => d.rule === "dead-link");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]?.severity).toBe("warn");
  });

  test("a root with a ref is checked at that commit, not in the checkout", async () => {
    const store = await sandbox();
    const harbor = join(store.root, "..", "harbor");
    await mkdir(join(harbor, "web", "src", "composer"), { recursive: true });
    await Bun.write(join(harbor, "web", "src", "composer", "send.ts"), "export {};\n");
    const gitIn = (...args: string[]) => Bun.$`git ${args}`.cwd(harbor).quiet();
    await gitIn("init", "-q");
    await gitIn("add", "-A");
    await gitIn("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base");
    await rm(join(harbor, "web"), { recursive: true });

    const config = join(store.root, "trove.yaml");
    const text = await Bun.file(config).text();
    await Bun.write(
      config,
      text.replace("harbor: ../harbor", "harbor: { path: ../harbor, ref: HEAD }"),
    );
    const reopened = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    const doc = reopened.index.byRel.get("audits/AUDIT_WEB_1.md");
    if (!doc) throw new Error("no web audit");
    const resolved = resolveLinks(reopened.index, doc);
    expect(resolved.find((link) => link.target.endsWith("send.ts"))?.state).toBe("ok");
    expect(resolved.find((link) => link.target.endsWith("threads.ts"))?.state).toBe("dead");

    await Bun.write(join(harbor, ".gitignore"), "web/src/stores/\n");
    await mkdir(join(harbor, "web", "src", "stores"), { recursive: true });
    await Bun.write(join(harbor, "web", "src", "stores", "threads.ts"), "export {};\n");
    const ignored = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    const again = resolveLinks(ignored.index, doc);
    expect(again.find((link) => link.target.endsWith("threads.ts"))?.state).toBe("ok");
  });
});

/** A code root where `send.ts` lives on and `threads.ts` was deleted in the last commit. */
const harborRepo = async (store: Store) => {
  const harbor = join(store.root, "..", "harbor");
  for (const file of ["web/src/composer/send.ts", "web/src/stores/threads.ts"]) {
    await mkdir(dirname(join(harbor, file)), { recursive: true });
    await Bun.write(join(harbor, file), "export {};\n");
  }
  const gitIn = async (...args: string[]) =>
    (await Bun.$`git -c user.name=t -c user.email=t@t ${args}`.cwd(harbor).quiet().text()).trim();
  await gitIn("init", "-q");
  await gitIn("add", "-A");
  await gitIn("commit", "-qm", "base");
  await gitIn("rm", "-q", "web/src/stores/threads.ts");
  await gitIn("commit", "-qm", "drop threads");
  return gitIn;
};

const reopen = (store: Store) => openStore({ cwd: store.root, store: store.root, today: TODAY });

const THREADS = "../harbor/web/src/stores/threads.ts";

describe("links --fix", () => {
  test("marks a link to deleted code with the commit that deleted it", async () => {
    const store = await sandbox();
    const gitIn = await harborRepo(store);
    const short = await gitIn("rev-parse", "--short", "HEAD");

    const plan = await pinDeadLinks(store.index, store.index.documents);
    expect(plan.notes).toContain(`audits/AUDIT_WEB_1.md:66 ${THREADS}: deleted in ${short}`);
    expect(plan.notes).toContain(
      "audits/AUDIT_WEB_1.md:70 ../harbor/web/src/notifications/notify.ts: left as is, never in HEAD or any other branch",
    );
    expect((await applyPlan(store, plan)).introduced).toEqual([]);
    expect(await read(store, "audits/AUDIT_WEB_1.md")).toContain(
      `[threads.ts:120-151](../../harbor/web/src/stores/threads.ts#L120-L151) *(deleted in ${short})*.`,
    );

    const reopened = await reopen(store);
    const web = reopened.index.byRel.get("audits/AUDIT_WEB_1.md");
    if (!web) throw new Error("no web audit");
    const threads = resolveLinks(reopened.index, web).find((link) => link.target === THREADS);
    expect(threads).toMatchObject({ state: "ok", pin: { note: "deleted in", commit: short } });
    const dead = runRules(reopened.rules, reopened.index)
      .filter((d) => d.rule === "dead-link")
      .map((d) => d.message);
    expect(dead).not.toContain(`dead link: ${THREADS}`);
    expect(dead).toContain("dead link: ../harbor/web/src/notifications/notify.ts");
  });

  test("a note naming a commit that never had the file stays dead", async () => {
    const store = await sandbox();
    const gitIn = await harborRepo(store);
    const short = await gitIn("rev-parse", "--short", "HEAD");
    const rel = "audits/AUDIT_WEB_1.md";
    const notify = "../harbor/web/src/notifications/notify.ts";
    const text = await read(store, rel);
    await Bun.write(join(store.root, rel), text.replace("#L17)", `#L17) *(deleted in ${short})*`));
    const reopened = await reopen(store);
    const web = reopened.index.byRel.get(rel);
    if (!web) throw new Error("no web audit");
    const marked = resolveLinks(reopened.index, web).find((link) => link.target === notify);
    expect(marked).toMatchObject({ state: "dead", pin: { note: "deleted in", commit: short } });
    const plan = await pinDeadLinks(reopened.index, [web]);
    expect(plan.notes).toContain(
      `${rel}:70 ${notify}: left as is, not readable deleted in ${short}`,
    );
  });

  test("a pushed commit on a GitHub origin becomes a permalink", async () => {
    const store = await sandbox();
    const gitIn = await harborRepo(store);
    const parent = await gitIn("rev-parse", "HEAD^");
    await gitIn("remote", "add", "origin", "git@github.com:acme/harbor.git");
    const web = store.index.byRel.get("audits/AUDIT_WEB_1.md");
    if (!web) throw new Error("no web audit");

    const unpushed = await pinDeadLinks(store.index, [web]);
    expect(unpushed.changes[0]?.text).toContain("#L120-L151) *(deleted in ");

    await gitIn("update-ref", "refs/remotes/origin/main", "HEAD");
    const pushed = await pinDeadLinks(store.index, [web]);
    expect(pushed.changes[0]?.text).toContain(
      `[threads.ts:120-151](https://github.com/acme/harbor/blob/${parent}/web/src/stores/threads.ts#L120-L151).`,
    );
  });

  test("a file only another branch has is pinned at that branch's last commit", async () => {
    const store = await sandbox();
    const gitIn = await harborRepo(store);
    await gitIn("checkout", "-q", "-b", "side");
    await mkdir(join(store.root, "..", "harbor", "web", "src", "notifications"), {
      recursive: true,
    });
    await Bun.write(
      join(store.root, "..", "harbor", "web", "src", "notifications", "notify.ts"),
      "x\n",
    );
    await gitIn("add", "-A");
    await gitIn("commit", "-qm", "side work");
    const side = await gitIn("rev-parse", "--short", "HEAD");
    await gitIn("checkout", "-q", "-");
    await gitIn("branch", "-q", "-m", "side", "feature");

    const web = store.index.byRel.get("audits/AUDIT_WEB_1.md");
    if (!web) throw new Error("no web audit");
    const plan = await pinDeadLinks(store.index, [web]);
    expect(plan.notes).toContain(
      `audits/AUDIT_WEB_1.md:70 ../harbor/web/src/notifications/notify.ts: at ${side} on feature`,
    );
    expect(plan.changes[0]?.text).toContain(`#L17) *(at ${side})*`);
    expect((await applyPlan(store, plan)).introduced).toEqual([]);
    const reopened = await reopen(store);
    const pinned = resolveLinks(reopened.index, reopened.index.byRel.get(web.rel) ?? web).find(
      (link) => link.target.endsWith("notify.ts"),
    );
    expect(pinned).toMatchObject({ state: "ok", pin: { note: "at", commit: side } });
  });

  test("an SSH alias takes the real host for the web link", () => {
    expect(sshHost("git@work.github:acme/harbor.git")).toBe("work.github");
    expect(sshHost("ssh://git@work.github/acme/harbor.git")).toBe("work.github");
    expect(sshHost("https://github.com/acme/harbor.git")).toBeUndefined();
    expect(sshHost("C:\\repos\\harbor")).toBeUndefined();
    expect(webRepo("git@work.github:acme/harbor.git", "github.com")?.base).toBe(
      "https://github.com/acme/harbor",
    );
    expect(webRepo("git@work.alias:acme/harbor.git", "git.example.com")).toBeUndefined();
  });

  test("web remotes of GitHub and GitLab, without credentials", () => {
    expect(webRepo("https://user:secret@github.com/acme/harbor.git")).toEqual({
      base: "https://github.com/acme/harbor",
      blob: "blob",
    });
    expect(webRepo("ssh://git@gitlab.example.com:2222/team/sub/harbor.git")).toEqual({
      base: "https://gitlab.example.com/team/sub/harbor",
      blob: "-/blob",
    });
    expect(webRepo("git@github.com:acme/harbor")?.base).toBe("https://github.com/acme/harbor");
    expect(webRepo("https://git.example.com/acme/harbor.git")).toBeUndefined();
    expect(webRepo("/srv/git/harbor.git")).toBeUndefined();
    expect(webRepo("C:\\repos\\harbor")).toBeUndefined();
  });

  test("the CLI counts dead links against all links and writes nothing on a dry run", async () => {
    const store = await sandbox();
    const flags = ["--store", store.root];
    const none = captureIo(store.root);
    expect(await run(["links", "--dead", ...flags], none)).toBe(0);
    expect(none.stdout()).toMatch(/^0 dead of \d+ links$/m);

    await harborRepo(store);
    const before = await read(store, "audits/AUDIT_WEB_1.md");
    const dry = captureIo(store.root);
    expect(await run(["links", "--fix", "--dry-run", ...flags], dry)).toBe(0);
    expect(dry.stdout()).toContain("dry run: nothing written");
    expect(await read(store, "audits/AUDIT_WEB_1.md")).toBe(before);
  });
});

const numbered = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `export const line${i + 1} = ${i + 1};`);

const harborDir = (store: Store) => join(store.root, "..", "harbor");

const writeLines = (store: Store, file: string, lines: readonly string[]) =>
  Bun.write(join(harborDir(store), file), `${lines.join("\n")}\n`);

const commitOn = async (store: Store, date: string, message: string) => {
  const harbor = harborDir(store);
  await Bun.$`git add -A`.cwd(harbor).quiet();
  await Bun.$`git -c user.name=t -c user.email=t@t commit -qm ${message}`
    .cwd(harbor)
    .env({ ...process.env, GIT_COMMITTER_DATE: `${date}T12:00:00+0000` })
    .quiet();
};

const SEND = "web/src/composer/send.ts";
const VIEW = "web/src/threads/ThreadView.tsx";

/**
 * A code root committed before the web audit was checked on 2026-10-10. After the check,
 * `send.ts` changed inside the lines WEB1-1 names and `ThreadView.tsx` only outside WEB1-2's line.
 */
const driftedRepo = async (store: Store) => {
  const harbor = harborDir(store);
  for (const file of [SEND, VIEW, "web/src/a/index.ts", "web/src/b/index.ts"]) {
    await mkdir(dirname(join(harbor, file)), { recursive: true });
  }
  await Bun.$`git init -q`.cwd(harbor).quiet();
  await writeLines(store, SEND, numbered(80));
  await writeLines(store, VIEW, numbered(100));
  await writeLines(store, "web/src/a/index.ts", []);
  await writeLines(store, "web/src/b/index.ts", []);
  await commitOn(store, "2026-10-01", "base");

  const view = numbered(100);
  view[87] = "export const line88 = 'same day as the check';";
  await writeLines(store, VIEW, view);
  await commitOn(store, "2026-10-10", "same day as the check");
  await Bun.$`git tag checked`.cwd(harbor).quiet();

  const send = numbered(80);
  send[49] = "export const retry = 1;";
  await writeLines(store, SEND, [...numbered(10), ...send]);
  view[91] = "export const line92 = 'moved';";
  await writeLines(store, VIEW, ["// a", "// b", "// c", ...view]);
  await commitOn(store, "2026-10-12", "retry sends");
  return view;
};

const driftOf = (store: Store, ids: readonly string[]) =>
  queryRows(store.index, "items", { id: [...ids] }, ["id", "drift"]).rows;

describe("drift", () => {
  test("an item drifts when lines its section links to changed after the check", async () => {
    const store = await sandbox();
    const view = await driftedRepo(store);
    const drifted = selectItems(store.index, { drift: ["true"] }).map((item) => item.id);
    expect(drifted).toEqual(["WEB1-1"]);
    expect(driftOf(store, ["WEB1-1", "WEB1-2", "WEB1-4", "WEB1-7"])).toEqual([
      { id: "WEB1-1", drift: "true" },
      { id: "WEB1-2", drift: "file" },
      { id: "WEB1-4", drift: "false" },
      { id: "WEB1-7", drift: "unknown" },
    ]);

    const io = captureIo(store.root);
    const args = ["query", "items", "drift=true", "--columns", "id,drift"];
    expect(await run([...args, "--store", store.root], io)).toBe(0);
    expect(io.stdout()).toMatch(/WEB1-1\s+true/);
    const elsewhere = selectItems(store.index, { drift: ["file"] }).map((item) => item.id);
    expect(elsewhere).toEqual(["WEB1-2"]);

    view[87] = "export const line88 = 'virtualized';";
    await writeLines(store, VIEW, ["// a", "// b", "// c", ...view]);
    await commitOn(store, "2026-10-13", "virtualize the thread");
    expect(driftOf(await reopen(store), ["WEB1-2"])).toEqual([{ id: "WEB1-2", drift: "true" }]);
  });

  test("a block cell names the changed lines, `—` when unchanged and `?` when unchecked", async () => {
    const store = await sandbox();
    await driftedRepo(store);
    const context = { index: store.index, rel: "NOTES.md", base: {} };
    const ids = "WEB1-1,WEB1-2,WEB1-4,WEB1-7";
    expect(renderView("items", { id: ids, columns: "id,drift" }, context)).toBe(
      [
        "| id | drift |",
        "| -- | ----- |",
        `| WEB1-1 | ${SEND}:41-63 |`,
        `| WEB1-2 | ${VIEW} (other lines) |`,
        "| WEB1-4 | — |",
        "| WEB1-7 | ? |",
      ].join("\n"),
    );
  });

  test("file names in inline code count when one tracked file matches", async () => {
    const store = await sandbox();
    await driftedRepo(store);
    const audit = join(store.root, "audits/AUDIT_WEB_1.md");
    const text = await Bun.file(audit).text();
    await Bun.write(
      audit,
      text
        .replace("while it is encoded |", "while it is encoded in `send.ts:50` |")
        .replace("Encoding runs on the main thread;", "Encoding in `composer/send.ts:1-5` runs;")
        .replace("Add `aria-label`", "Add `aria-label` in `index.ts`"),
    );
    const reopened = await reopen(store);
    expect(driftOf(reopened, ["WEB1-7", "WEB1-8"])).toEqual([
      { id: "WEB1-7", drift: "true" },
      { id: "WEB1-8", drift: "unknown" },
    ]);
    const context = { index: reopened.index, rel: "NOTES.md", base: {} };
    expect(renderView("items", { id: "WEB1-7", columns: "drift" }, context)).toContain(
      `| ${SEND}:50 |`,
    );
  });

  test("is unknown when the root is missing or its ref is unknown", async () => {
    const store = await sandbox();
    expect(driftOf(store, ["WEB1-1", "WEB1-4"])).toEqual([
      { id: "WEB1-1", drift: "unknown" },
      { id: "WEB1-4", drift: "unknown" },
    ]);

    await driftedRepo(store);
    const config = join(store.root, "trove.yaml");
    const text = await Bun.file(config).text();
    await Bun.write(
      config,
      text.replace("harbor: ../harbor", "harbor: { path: ../harbor, ref: nowhere }"),
    );
    const reopened = await reopen(store);
    expect(selectItems(reopened.index, { drift: ["true", "false"] })).toEqual([]);
  });

  test("a root with a ref reads changes at that ref, not in the checkout", async () => {
    const store = await sandbox();
    await driftedRepo(store);
    const harbor = harborDir(store);
    await Bun.$`git branch -q tip`.cwd(harbor).quiet();
    await Bun.$`git checkout -q checked`.cwd(harbor).quiet();
    expect(selectItems(store.index, { drift: ["true"] })).toEqual([]);

    const config = join(store.root, "trove.yaml");
    const text = await Bun.file(config).text();
    await Bun.write(
      config,
      text.replace("harbor: ../harbor", "harbor: { path: ../harbor, ref: tip }"),
    );
    const reopened = await reopen(store);
    const drifted = selectItems(reopened.index, { drift: ["true"] }).map((item) => item.id);
    expect(drifted).toEqual(["WEB1-1"]);
  });

  test("diff hunks touch a line range by their old-side lines", () => {
    const hunks = parseHunks(
      [
        "diff --git a/src/my file.ts b/src/my file.ts",
        "--- a/src/my file.ts",
        "+++ b/src/my file.ts",
        "@@ -0,0 +1,3 @@",
        "@@ -12,2 +15,2 @@",
        "@@ -40 +43 @@",
        "--- /dev/null",
        "diff --git a/new.ts b/new.ts",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/new.ts",
        "@@ -0,0 +1 @@",
      ].join("\n"),
    );
    const mine = hunks.get("src/my file.ts") ?? [];
    expect(mine).toHaveLength(3);
    const hit = (from: number, to: number) => mine.some((hunk) => touches(hunk, { from, to }));
    expect(hit(1, 10)).toBe(false);
    expect(hit(13, 13)).toBe(true);
    expect(hit(14, 39)).toBe(false);
    expect(hit(40, 40)).toBe(true);
    expect(touches({ start: 20, count: 0 }, { from: 20, to: 21 })).toBe(true);
    expect(touches({ start: 21, count: 0 }, { from: 20, to: 21 })).toBe(false);
    expect((hunks.get("new.ts") ?? []).some((hunk) => touches(hunk, { from: 9, to: 9 }))).toBe(
      true,
    );
  });
});

const withConfig = async (store: Store, from: string, to: string): Promise<Store> => {
  const config = join(store.root, "trove.yaml");
  await Bun.write(config, (await Bun.file(config).text()).replace(from, to));
  return reopen(store);
};

const WHAT_COLUMN = "    - { key: what, label: what is left, required: true }\n";

const withCheckedColumn = (store: Store) =>
  withConfig(store, WHAT_COLUMN, `${WHAT_COLUMN}    - { key: checked, label: checked }\n`);

const harborHead = async (store: Store) =>
  (await Bun.$`git rev-parse --short HEAD`.cwd(harborDir(store)).text()).trim();

/** Line 45 of `send.ts` sits inside the lines WEB1-1 names once it is rechecked at the tip. */
const editSendLine45 = async (store: Store, text: string, date: string) => {
  const lines = (await Bun.file(join(harborDir(store), SEND)).text()).trimEnd().split("\n");
  lines[44] = text;
  await writeLines(store, SEND, lines);
  await commitOn(store, date, `edit line 45 on ${date}`);
};

describe("item recheck", () => {
  test("writes the root's commit into a new checked column, and drift starts over", async () => {
    const store = await sandbox();
    await driftedRepo(store);
    expect(() => recheckItems(store.index, { ids: ["WEB1-1"] })).toThrow(/no checked column/);
    expect(() => recheckItems(store.index, {})).toThrow(/needs ids/);

    const ready = await withCheckedColumn(store);
    const head = await harborHead(store);
    const outcome = await applyPlan(ready, recheckItems(ready.index, { drifted: true }));
    expect(outcome.introduced).toEqual([]);
    expect(outcome.notes).toEqual([`WEB1-1 checked at ${head}`]);
    const audit = await read(ready, "audits/AUDIT_WEB_1.md");
    expect(audit).toContain("| id | P | module | owner | status | what is left | checked |");
    expect(audit).toContain(`no "not sent" mark | ${head} |`);
    expect(audit).toContain("on mid-range laptops |  |");
    expect(driftOf(await reopen(ready), ["WEB1-1", "WEB1-2"])).toEqual([
      { id: "WEB1-1", drift: "false" },
      { id: "WEB1-2", drift: "file" },
    ]);
  });

  test("--unchanged rechecks only items whose code changed in whitespace alone", async () => {
    const store = await sandbox();
    await driftedRepo(store);
    const ready = await withCheckedColumn(store);
    await applyPlan(ready, recheckItems(ready.index, { ids: ["WEB1-1"] }));

    await editSendLine45(store, "export  const line35 =  35;", "2026-10-13");
    expect(driftOf(await reopen(ready), ["WEB1-1"])).toEqual([{ id: "WEB1-1", drift: "true" }]);
    const args = ["item", "recheck", "--drifted", "--unchanged", "--store", ready.root];
    const spaces = captureIo(ready.root);
    expect(await run(args, spaces)).toBe(0);
    expect(spaces.stdout()).toContain(`WEB1-1 checked at ${await harborHead(store)}`);

    await editSendLine45(store, "export const line35 = 36;", "2026-10-14");
    const before = await read(ready, "audits/AUDIT_WEB_1.md");
    const real = captureIo(ready.root);
    expect(await run(args, real)).toBe(0);
    expect(real.stdout()).toContain("left as they are, their code changed: WEB1-1");
    expect(await read(ready, "audits/AUDIT_WEB_1.md")).toBe(before);
  });
});

describe("stale-check", () => {
  const messages = (store: Store, id: string) =>
    runRules(store.rules, store.index)
      .filter((d) => d.rule === "stale-check" && d.message.includes(`${id} `))
      .map((d) => d.message);

  test("is off by default, then flags old checks and code that kept changing", async () => {
    const store = await sandbox();
    await driftedRepo(store);
    expect(messages(store, "WEB1-1")).toEqual([]);

    const rule = "rules:\n  stale-check: { level: warn, limit: 3, commits: 1 }\n";
    const on = await withConfig(await withCheckedColumn(store), "rules:\n", rule);
    expect(messages(on, "WEB1-1").toSorted()).toEqual([
      "WEB1-1 not checked for 5 days",
      "the code of WEB1-1 changed in 1 commit(s) since its check",
    ]);
    expect(messages(on, "WEB1-4")).toEqual(["WEB1-4 not checked for 5 days"]);

    await applyPlan(on, recheckItems(on.index, { ids: ["WEB1-1"] }));
    expect(messages(await reopen(on), "WEB1-1")).toEqual([]);
  });
});

describe("csv export", () => {
  test("quotes what needs quoting and ends lines with CRLF", () => {
    const csv = toCsv([{ id: "A-1", what: 'say "hi", then go' }], ["id", "what"]);
    expect(csv).toBe('id,what\r\nA-1,"say ""hi"", then go"\r\n');
  });
});
