import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { openStore, renderReport, runRules } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const SANDBOX = join(ROOT, "sandbox");
const store = await openStore({ cwd: SANDBOX, store: SANDBOX, today: TODAY });

describe("sandbox store", () => {
  test("is clean: no errors, no warnings", () => {
    const loud = runRules(store.rules, store.index).filter((d) => d.severity !== "info");
    expect(loud).toEqual([]);
  });

  test("covers every document type the config declares", () => {
    const used = new Set(store.index.documents.map((doc) => doc.type));
    const declared = Object.keys(store.config.types).filter((type) => type !== "backlog");
    expect(declared.filter((type) => !used.has(type))).toEqual([]);
  });

  test("has its generated reports up to date", async () => {
    for (const report of Object.values(store.config.reports)) {
      const committed = await Bun.file(join(SANDBOX, report.output)).text();
      const date = /^date: (.+)$/m.exec(committed)?.[1] ?? "";
      expect(renderReport(report, store.index, date).text).toBe(committed);
    }
  });
});
