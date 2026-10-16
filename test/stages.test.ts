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

const plan = (body: string, type = "plan", header = "", rel = "plans/PLAN_X.md") =>
  parseDocument(
    { path: join(root, rel), rel, text: `---\ntype: ${type}\n${header}---\n${body}` },
    store.config,
  );

const field = (body: string, name: string) => documentField(plan(body), name, store.index);

describe("stages written as headings or bold labels", () => {
  test("coded sibling headings are stages; a mark, a parenthesis or a status line says done", () => {
    const body = [
      "# Plan",
      "**Status:** in progress",
      "## Э1. Каталог (влит)",
      "### Шаги",
      "text",
      "## Э2. Поиск",
      "**Статус:** слито в master",
      "## [x] Э3. Корзина",
      "## Э4 — Оплата ✅",
      "## Э5. Уведомления",
      "Статус: не влито",
      "## Э6. **Экспорт** в `csv`. Потом всё остальное (in progress)",
      "## Риски",
      "## Э7. After the run",
    ].join("\n");
    expect(plan(body).stages).toEqual([
      { title: "Э1 — Каталог", done: true },
      { title: "Э2 — Поиск", done: true },
      { title: "Э3 — Корзина", done: true },
      { title: "Э4 — Оплата", done: true },
      { title: "Э5 — Уведомления", done: false },
      { title: "Э6 — Экспорт в csv", done: false },
    ]);
    expect(field(body, "next")).toBe("Э5 — Уведомления");
  });

  test("Stage and Этап headings work in either language", () => {
    const body =
      "### Stage 1 — Outbox\nStatus: done\n### Stage 2 — Done\n### Stage 3 — Complete rewrite\n";
    expect(plan(body).stages).toEqual([
      { title: "Stage 1 — Outbox", done: true },
      { title: "Stage 2", done: true },
      { title: "Stage 3 — Complete rewrite", done: false },
    ]);
    expect(field("## Этап 1. Схема (готово)\n## Этап 2. Данные\n", "progress")).toBe("1/2");
  });

  test("bold labels in paragraphs are stages", () => {
    const body = [
      "**Б1.** Перенести [очередь](https://example.com) на `outbox`. Подробности ниже (done)",
      "",
      "**Б2 — влито.** Кэш профилей.",
      "",
      "**Б3.** Настройки синхронизации.",
      "**Статус:** выполнен",
      "",
      "**Б4.** Поиск по истории, который очень долго описывается и никак не может закончиться вовремя",
    ].join("\n");
    expect(plan(body).stages).toEqual([
      { title: "Б1 — Перенести очередь на outbox", done: true },
      { title: "Б2 — Кэш профилей", done: true },
      { title: "Б3 — Настройки синхронизации", done: true },
      {
        title:
          "Б4 — Поиск по истории, который очень долго описывается и никак не может закончиться…",
        done: false,
      },
    ]);
  });

  test("a lone coded heading, mixed codes or plain numbered sections are not stages", () => {
    expect(field("## S3 bucket\n## Rollout\n", "progress")).toBeUndefined();
    expect(field("## A1. One\n## B1. Two\n", "progress")).toBeUndefined();
    expect(field("## 1. Context\n## 2. Design\n", "progress")).toBeUndefined();
    expect(field("**Note.** one\n\n**B1.** two\n", "progress")).toBeUndefined();
  });

  test("the first structure in the body wins", () => {
    const body = "- [x] prerequisite\n\n## S1. One\n## S2. Two\n";
    expect(field(body, "progress")).toBe("1/1");
    const table = "## S1. One\n## S2. Two (done)\n\n| stage | status |\n| - | - |\n| S1 | done |\n";
    expect(field(table, "progress")).toBe("1/2");
  });

  test("a type without the capability never reads them", () => {
    expect(plan("## A1. One\n## A2. Two\n", "audit").stages).toEqual([]);
  });
});

describe("stage titles and done words", () => {
  test("titles lose markup and keep their first sentence", () => {
    const body = [
      "| # | stage | status |",
      "| - | ----- | ------ |",
      "| Э1 | **Outbox** with [retries](x.md). Then more | done |",
      "| Э2 | `cache` _warm-up_ for snake_case names | todo |",
    ].join("\n");
    expect(plan(body).stages.map((stage) => stage.title)).toEqual([
      "Outbox with retries",
      "cache warm-up for snake_case names",
    ]);
  });

  test("the defaults cover more words without counting their negations", () => {
    const words = ["влито", "слито", "в master", "done ✓", "выполнен", "реализовано", "готов"];
    const more = ["сделан", "merged", "shipped", "released", "complete"];
    const negated = ["не влито", "not done", "не готов", "incomplete", "готовится"];
    const rows = [...words, ...more, ...negated].map((value, i) => `| ${i} | ${value} |`);
    const doc = plan(["| stage | status |", "| - | - |", ...rows].join("\n"));
    expect(doc.stages.map((stage) => stage.done)).toEqual([
      ...[...words, ...more].map(() => true),
      ...negated.map(() => false),
    ]);
  });

  test("finished documents have no stages", () => {
    const body = "- [x] one\n- [ ] two\n";
    expect(plan(body, "plan", "status: closed\n").stages).toEqual([]);
    expect(plan(body, "plan", "status: archived\n").stages).toEqual([]);
    expect(plan(body, "plan", "", ".archive/plans/PLAN_X.md").stages).toEqual([]);
    expect(plan(body, "plan", "status: in progress\n").stages).toHaveLength(2);
  });
});

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
      "| [PLAN_PUSH_RETRY](plans/PLAN_PUSH_RETRY.md) | 1/3 ▰▱▱ | Drop tokens that fail three times in a row |",
    );
  });

  test("takes filters and the list layout", () => {
    const { text } = fill("<!-- trove:progress next=~Drop as=list -->");
    expect(text).toContain("- [PLAN_PUSH_RETRY](plans/PLAN_PUSH_RETRY.md) 1/3 ▰▱▱ — Drop tokens");
    expect(text).not.toContain("PLAN_OFFLINE_MODE");
  });
});
