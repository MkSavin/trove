import { afterAll, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentField } from "../src/core/index/query.ts";
import { fillLiveBlocks } from "../src/core/live/fill.ts";
import { openStore, parseDocument } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const root = await mkdtemp(join(tmpdir(), "trove-stages-"));
await cp(join(ROOT, "sandbox"), root, { recursive: true });
await Bun.write(
  join(root, "plans/PLAN_PUSH_RETRY.md"),
  (await Bun.file(join(root, "plans/PLAN_PUSH_RETRY.md")).text())
    .replace("1. **Retry queue", "- [x] **Retry queue")
    .replace("2. **Drop tokens", "- [ ] **Drop tokens")
    .replace("3. **Dashboard", "- [ ] **Dashboard"),
);
const store = await openStore({ cwd: root, store: root, today: TODAY });

afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));

const plan = (body: string, type = "plan") =>
  parseDocument(
    {
      path: join(root, "plans/PLAN_X.md"),
      rel: "plans/PLAN_X.md",
      text: `---\ntype: ${type}\n---\n${body}`,
    },
    store.config,
  );

const field = (body: string, name: string) => documentField(plan(body), name, store.index);

describe("stages of a plan", () => {
  test("a task list counts its top-level items; nested ones are steps", () => {
    const body =
      "- [x] one\n  - [ ] detail\n- [X] two\n\n  more about two\n- [ ] three\n- [ ] four\n";
    expect(plan(body).stages).toEqual([
      { title: "one", done: true },
      { title: "two", done: true },
      { title: "three", done: false },
      { title: "four", done: false },
    ]);
    expect(field(body, "progress")).toBe("2/4");
    expect(field(body, "next")).toBe("three");
    expect(field(body, "bar")).toBe("2/4 ▰▰▱▱");
  });

  test("a table with a status column reads done values in English and Russian", () => {
    const body = [
      "| # | stage | Статус |",
      "| - | ----- | ------ |",
      "| 1 | outbox | **влит** abc1234 |",
      "| 2 | cache | ✓ |",
      "| 3 | settings | merged 2026-10-01 |",
      "| 4 | search | incomplete |",
      "| 5 | export | not done |",
    ].join("\n");
    expect(field(body, "progress")).toBe("3/5");
    expect(field(body, "next")).toBe("search");
  });

  test("the first structure wins; generated blocks and code do not count", () => {
    const body = [
      "<!-- trove:items owner=api as=list -->",
      "- [ ] generated",
      "<!-- /trove:items -->",
      "```md",
      "- [ ] example",
      "```",
      "| stage | state |",
      "| ----- | ----- |",
      "| ship | done |",
      "",
      "- [ ] a later checklist",
    ].join("\n");
    expect(field(body, "progress")).toBe("1/1");
    expect(field(body, "next")).toBeUndefined();
  });

  test("a type without the capability, or a plan without stages, has no progress", () => {
    expect(field("- [ ] one\n", "progress")).toBe("0/1");
    expect(plan("- [ ] one\n", "research").stages).toEqual([]);
    expect(field("| what | owner |\n| --- | --- |\n| a | b |\n", "progress")).toBeUndefined();
  });

  test("the done vocabulary comes from the config", () => {
    const config = { ...store.config, stages: { status: ["phase"], done: ["landed"] } };
    const doc = parseDocument(
      {
        path: join(root, "plans/PLAN_X.md"),
        rel: "plans/PLAN_X.md",
        text: "---\ntype: plan\n---\n| step | phase |\n| - | - |\n| a | landed |\n| b | done |\n",
      },
      config,
    );
    expect(doc.stages.map((stage) => stage.done)).toEqual([true, false]);
  });
});

describe("the progress view", () => {
  const fill = (open: string) =>
    fillLiveBlocks(`${open}\n<!-- /trove:progress -->\n`, "NOTES.md", store.index);

  test("lists documents with stages, their progress and next stage", () => {
    const { text, problems } = fill("<!-- trove:progress type=plan place=work -->");
    expect(problems).toEqual([]);
    expect(text).toContain("| document | progress | next |");
    expect(text).toContain(
      '| [PLAN_OFFLINE_MODE](plans/PLAN_OFFLINE_MODE.md) | 0/3 ▱▱▱ | outbox with retries and a "not sent" mark |',
    );
    expect(text).toContain(
      "| [PLAN_PUSH_RETRY](plans/PLAN_PUSH_RETRY.md) | 1/3 ▰▱▱ | **Drop tokens that fail three times in a row.** In progress. |",
    );
  });

  test("takes filters and the list layout", () => {
    const { text } = fill("<!-- trove:progress next=~Drop as=list -->");
    expect(text).toContain("- [PLAN_PUSH_RETRY](plans/PLAN_PUSH_RETRY.md) 1/3 ▰▱▱ — **Drop tokens");
    expect(text).not.toContain("PLAN_OFFLINE_MODE");
  });
});
