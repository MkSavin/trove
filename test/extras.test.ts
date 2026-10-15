import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toCsv } from "../src/core/export/csv.ts";
import { resolveLinks } from "../src/core/index/links.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { moveItem } from "../src/core/ops/item-move.ts";
import { lineDiff } from "../src/core/text/diff.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

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
    const plan = moveItem(store.index, "WEB1-6", "AUDIT_API_2");
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
    const first = await applyPlan(store, moveItem(store.index, "MOB1-1", "AUDIT_API_2"));
    expect(first.introduced).toEqual([]);
    const next = await openStore({ cwd: store.root, store: store.root, today: TODAY });
    const refused = await applyPlan(next, moveItem(next.index, "MOB1-2", "AUDIT_API_2"));
    expect(refused.introduced.map((d) => d.rule)).toEqual(["lifecycle"]);
    const done = await applyPlan(
      next,
      moveItem(next.index, "MOB1-2", "AUDIT_API_2", { archive: true }),
    );
    expect(done.introduced).toEqual([]);
    expect(
      await Bun.file(join(store.root, ".archive/audits/mobile/AUDIT_MOBILE_1.md")).exists(),
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
  });
});

describe("csv export", () => {
  test("quotes what needs quoting and ends lines with CRLF", () => {
    const csv = toCsv([{ id: "A-1", what: 'say "hi", then go' }], ["id", "what"]);
    expect(csv).toBe('id,what\r\nA-1,"say ""hi"", then go"\r\n');
  });
});
