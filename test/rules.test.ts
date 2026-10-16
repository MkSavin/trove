import { describe, expect, test } from "bun:test";
import { frontMatterYaml } from "../src/core/rules/builtin/front-matter.ts";
import { defineRule, indexDocuments, parseDocument, runRules, type Store } from "../src/index.ts";
import { openFixture, TODAY } from "./helpers.ts";

const store: Store = await openFixture();
const diagnostics = runRules(store.rules, store.index);
const pairs = (severity: string) =>
  diagnostics.filter((d) => d.severity === severity).map((d) => `${d.file} ${d.rule}`);

describe("built-in rules on the fixture store", () => {
  test("report exactly the planted errors", () => {
    expect(pairs("error")).toEqual([
      ".archive/audits/AUDIT_OPEN_1.md lifecycle",
      ".archive/specs/SPEC_WRONG.md archive-status",
      "audits/AUDIT_BROKEN_1.md status-line",
      "audits/AUDIT_BROKEN_1.md status-line",
      "audits/AUDIT_BROKEN_1.md ledger-row-shape",
      "audits/AUDIT_BROKEN_1.md id-format",
      "audits/AUDIT_BROKEN_1.md id-hyphen",
      "audits/AUDIT_BROKEN_1.md id-format",
      "audits/AUDIT_BROKEN_1.md item-enum",
      "audits/AUDIT_DONE_1.md lifecycle",
      "audits/AUDIT_NOLEDGER_1.md ledger-block",
      "external/EXTERNAL_MEMO.md required-field",
      "external/EXTERNAL_MEMO.md known-type",
      "external/EXTERNAL_MEMO.md header-refs",
      "plans/PLAN_ARCHIVED_HERE.md archive-status",
      "plans/PLAN_NO_STATUS_LINE.md status-line",
      "plans/PLAN_NO_STATUS_LINE.md field-format",
      "prompts/PROMPT_BAD.md prompt-body",
      "prompts/PROMPT_BAD.md type-status",
      "research/RESEARCH_NO_HEADER.md front-matter",
      "research/RESEARCH_UNKNOWN_STATUS.md known-status",
      "specs/SPEC_CLOSED.md lifecycle",
    ]);
  });

  test("leave healthy documents alone", () => {
    const healthy = [
      "audits/AUDIT_GOOD_1.md",
      "audits/AUDIT_GOOD_1.RESOLVED.md",
      "prompts/PROMPT_GOOD.md",
    ];
    expect(diagnostics.filter((d) => healthy.includes(d.file))).toEqual([]);
  });

  test("flag stale work documents as info with the verify hint", () => {
    const stale = diagnostics.find((d) => d.rule === "stale");
    expect(stale).toMatchObject({ file: "DEBT.md", severity: "info", hint: "пройти каждый пункт" });
  });

  test("point at the offending line", () => {
    const shape = diagnostics.find((d) => d.rule === "ledger-row-shape");
    expect(shape?.line).toBe(17);
  });
});

describe("rule settings", () => {
  const withRules = (rules: Store["config"]["rules"]) => {
    const config = { ...store.config, rules };
    return runRules(store.rules, { ...store.index, config });
  };

  test("off silences a rule and a level overrides the default", () => {
    const result = withRules({
      lifecycle: { level: "off", since: undefined },
      "front-matter": { level: "warn", since: undefined },
    });
    expect(result.some((d) => d.rule === "lifecycle")).toBe(false);
    expect(result.find((d) => d.rule === "front-matter")?.severity).toBe("warn");
  });

  test("since exempts documents dated before it", () => {
    const result = withRules({ "archive-status": { level: "error", since: "2026-09-01" } });
    expect(result.filter((d) => d.rule === "archive-status").map((d) => d.file)).toEqual([
      "plans/PLAN_ARCHIVED_HERE.md",
    ]);
  });
});

describe("custom rules", () => {
  test("run alongside built-ins through defineRule", () => {
    const noTodo = defineRule({
      id: "no-todo",
      level: "warn",
      summary: "No TODO in documents.",
      scope: "document",
      check: (doc) => (doc.text.includes("TODO") ? [{ message: "TODO left" }] : []),
    });
    const doc = parseDocument(
      { path: "x.md", rel: "x.md", text: "---\ntype: plan\n---\nTODO" },
      store.config,
    );
    const index = indexDocuments(store.root, store.config, [doc], TODAY);
    expect(runRules([noTodo], index)).toMatchObject([{ rule: "no-todo", file: "x.md" }]);
  });
});

describe("front-matter-yaml", () => {
  const check = (header: string) => {
    const text = `---\ntype: plan\n${header}\n---\n# X\n`;
    const doc = parseDocument({ path: "x.md", rel: "x.md", text }, store.config);
    return runRules([frontMatterYaml], indexDocuments(store.root, store.config, [doc], TODAY));
  };

  test("points at the field whose value needs quotes", () => {
    expect(check("verify: step 2: a test exists")).toMatchObject([{ line: 3, severity: "warn" }]);
    expect(check('verify: "step 2: a test exists"')).toEqual([]);
  });
});
