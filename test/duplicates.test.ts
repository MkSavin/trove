import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { similarItems } from "../src/core/index/similar-items.ts";
import { sharedCount, similarity, wordStems } from "../src/core/text/words.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "trove-dup-"));
  copies.push(root);
  const store = join(root, "store");
  await cp(join(ROOT, "sandbox"), store, { recursive: true });
  return store;
};

const open = (root: string): Promise<Store> => openStore({ cwd: root, store: root, today: TODAY });

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

const AUDIT = "audits/AUDIT_API_2.md";
const LAST_ROW =
  "| API2-4 | P2 | infra | open | Database backups are not restore-tested; the last good restore is unknown |";

const addRows = async (root: string, rows: readonly string[]) => {
  const path = join(root, AUDIT);
  const text = await Bun.file(path).text();
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  await Bun.write(path, text.replace(LAST_ROW, [LAST_ROW, ...rows].join(eol)));
};

const turnOn = async (root: string, limit?: number) => {
  const path = join(root, "trove.yaml");
  const setting = limit === undefined ? "warn" : `{ level: warn, limit: ${limit} }`;
  const text = await Bun.file(path).text();
  await Bun.write(path, text.replace(/rules:(\r?\n)/, `rules:$1  duplicate-suspect: ${setting}$1`));
};

const percentOf = (a: string, b: string): number => {
  const [x, y] = [wordStems(a), wordStems(b)];
  return Math.round(similarity(sharedCount(x, y), x, y) * 100);
};

describe("duplicate-suspect", () => {
  test("words meet across case, punctuation and endings, in Russian and English", () => {
    expect([...wordStems("Messages, sent OFFLINE: dropped!")]).toEqual([
      "messag",
      "sent",
      "offlin",
      "dropp",
    ]);
    expect(
      percentOf(
        "Сообщение, отправленное офлайн, теряется",
        "Сообщения отправленные офлайн теряются",
      ),
    ).toBe(60);
    expect(percentOf("The badge is not reset", "Uploads are served inline")).toBe(0);
  });

  test("is off by default; once on, reports each similar pair once", async () => {
    const root = await sandbox();
    await addRows(root, [
      "| API2-5 | P2 | api | open | Messages sent while offline are dropped silently, with no retry |",
      "| API2-6 | P3 | api | open | Dropped offline sends never retry, [send.ts:50](../../harbor/web/src/composer/send.ts#L50) |",
    ]);
    const quiet = await open(root);
    expect(
      runRules(quiet.rules, quiet.index).filter((d) => d.rule === "duplicate-suspect"),
    ).toEqual([]);

    await turnOn(root);
    const store = await open(root);
    const found = runRules(store.rules, store.index).filter((d) => d.rule === "duplicate-suspect");
    expect(found.map(({ severity, file, message }) => ({ severity, file, message }))).toEqual([
      {
        severity: "warn",
        file: "audits/AUDIT_WEB_1.md",
        message: "WEB1-1 may duplicate API2-5 in audits/AUDIT_API_2.md: 86% of words match",
      },
      {
        severity: "warn",
        file: "audits/AUDIT_WEB_1.md",
        message:
          "WEB1-1 may duplicate API2-6 in audits/AUDIT_API_2.md: 33% of words match, both at web/src/composer/send.ts:50",
      },
    ]);
  });

  test("limit sets the share of matching words", async () => {
    const root = await sandbox();
    await addRows(root, [
      "| API2-5 | P2 | api | open | Messages sent while offline are dropped silently, with no retry |",
    ]);
    await turnOn(root, 90);
    const store = await open(root);
    expect(
      runRules(store.rules, store.index).filter((d) => d.rule === "duplicate-suspect"),
    ).toEqual([]);
  });

  test("stays fast on a thousand items", async () => {
    const root = await sandbox();
    const words = Array.from({ length: 400 }, (_, i) => `word${i.toString(36)}x`);
    const pick = (seed: number) => words[(seed * 7919) % words.length];
    await addRows(
      root,
      Array.from({ length: 1000 }, (_, i) => {
        const what = Array.from({ length: 8 }, (_, k) => pick(i * 8 + k)).join(" ");
        return `| API2-${i + 5} | P3 | api | open | ${what} |`;
      }),
    );
    const store = await open(root);
    const started = performance.now();
    similarItems(store.index, 50);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
