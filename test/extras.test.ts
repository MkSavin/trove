import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "../src/cli/run.ts";
import { toCsv } from "../src/core/export/csv.ts";
import { sshHost, webRepo } from "../src/core/git/permalink.ts";
import { resolveLinks } from "../src/core/index/links.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { moveItem } from "../src/core/ops/item-move.ts";
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

describe("csv export", () => {
  test("quotes what needs quoting and ends lines with CRLF", () => {
    const csv = toCsv([{ id: "A-1", what: 'say "hi", then go' }], ["id", "what"]);
    expect(csv).toBe('id,what\r\nA-1,"say ""hi"", then go"\r\n');
  });
});
