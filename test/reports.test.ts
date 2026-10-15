import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, parseDocument, renderReport, writeReports } from "../src/index.ts";
import { FIXTURE, openFixture, TODAY } from "./helpers.ts";

const store = await openFixture();
const backlog = store.config.reports.backlog;
const promptsIndex = store.config.reports["prompts-index"];
if (!backlog || !promptsIndex) throw new Error("example config lost its reports");

describe("renderReport", () => {
  const { text, rows } = renderReport(backlog, store.index, TODAY);

  test("groups by owner in the configured order, then sorts by priority and natural id", () => {
    expect(text.match(/^## .+$/gm)).toEqual([
      "## frontend",
      "## backend",
      "## Спеки и планы, не доведённые до конца",
    ]);
    const ids = [...text.matchAll(/^\| (GOOD1-\d+|DONE1-\d+|BRK1-\d+|OPEN1-\d+) /gm)].map(
      (m) => m[1],
    );
    expect(ids.slice(0, 3)).toEqual(["GOOD1-1", "GOOD1-2", "GOOD1-10"]);
    expect(rows).toBeGreaterThan(0);
  });

  test("renders empty cells as a dash unless the column says otherwise", () => {
    expect(text).toContain("| GOOD1-3 | P0 | — | открыто | Server item without a module column |");
    expect(text).toContain("| [PLAN_NO_STATUS_LINE](plans/PLAN_NO_STATUS_LINE.md) | не начат |  |");
  });

  test("produces a document that passes its own header checks", () => {
    const doc = parseDocument({ path: "BACKLOG.md", rel: "BACKLOG.md", text }, store.config);
    expect(doc.statusLine?.parsed).toMatchObject({
      status: "актуален",
      note: "Собран из реестров аудитов, руками не правится.",
      checked: TODAY,
    });
  });

  test("lists every work prompt, linked relative to the report folder", () => {
    const prompts = renderReport(promptsIndex, store.index, TODAY).text;
    expect(prompts).toContain("| [PROMPT_BAD](PROMPT_BAD.md) | frontend | — | — | 2026-10-01 |");
    expect(prompts).toContain(
      "| [PROMPT_GOOD](PROMPT_GOOD.md) | любая подсистема | тяжёлая модель | аудит | 2026-10-01 |",
    );
  });
});

describe("writeReports", () => {
  test("writes once, then leaves an unchanged report and its date alone", async () => {
    const copy = await mkdtemp(join(tmpdir(), "trove-reports-"));
    try {
      await cp(FIXTURE, copy, { recursive: true });
      const open = (today: string) => openStore({ cwd: copy, store: copy, today });

      const first = await writeReports((await open(TODAY)).index, ["backlog"]);
      const second = await writeReports((await open("2026-12-31")).index, ["backlog"]);
      expect(first[0]?.changed).toBe(true);
      expect(second[0]?.changed).toBe(false);
      expect(await Bun.file(join(copy, "BACKLOG.md")).text()).toContain(`date: ${TODAY}`);
    } finally {
      await rm(copy, { recursive: true, force: true, maxRetries: 5 });
    }
  });
});
