import { describe, expect, test } from "bun:test";
import { findAnchors } from "../scripts/docs/anchors.ts";
import { checkDocs } from "../scripts/docs/check.ts";
import { scanComments } from "../scripts/docs/comments.ts";
import { normalize, type Repo } from "../scripts/docs/repo.ts";
import { renderWorkaroundIndex } from "../scripts/docs/workarounds.ts";

const INDEX = ".agents/workarounds.md";

type Files = Readonly<Record<string, string>>;

const asFiles = (files: Files) => Object.entries(files).map(([path, text]) => ({ path, text }));

const repoOf = (docs: Files, code: Files, agents = "# Project\n"): Repo => {
  const repo = {
    agents: { path: "AGENTS.md", text: agents },
    docs: asFiles(docs),
    code: asFiles(code),
  };
  const index = renderWorkaroundIndex(repo, findAnchors(repo.code).anchors);
  return { ...repo, docs: [...repo.docs, { path: INDEX, text: index }] };
};

const problems = (docs: Files, code: Files, agents?: string): string[] =>
  checkDocs(repoOf(docs, code, agents));

const workaround = (slug: string, extra = ""): string =>
  `---\nanchor: WORKAROUND:${slug}\nrule: Do the safe thing.\n${extra}---\nSymptom.\n\nNot checked automatically: needs that platform.\n`;

describe("comment scanner", () => {
  test("finds comments and skips strings, templates and regular expressions", () => {
    const dollar = "$";
    const code = [
      'const a = "// not one"; // one',
      `const b = \`/* not ${dollar}{c /* two */} one */\`;`,
      "const r = /\\/\\/[/*]/.test(a) ? a / 2 / 1 : 0;",
      "/* three",
      "   lines */",
    ].join("\n");
    expect(scanComments(code).map(({ text, line, endLine }) => [text, line, endLine])).toEqual([
      [" one", 1, 1],
      [" two ", 2, 2],
      [" three\n   lines ", 4, 5],
    ]);
  });
});

describe("budgets", () => {
  test("AGENTS.md is told to shorten, other pages to split by topic", () => {
    expect(problems({}, {}, "x".repeat(3073)).join("\n")).toMatch(/AGENTS.md.*shorten/);
    expect(problems({ ".agents/big.md": "x".repeat(8193) }, {}).join("\n")).toMatch(
      /big.md.*split by topic/,
    );
  });

  test("size is counted after CRLF normalisation", () => {
    expect(normalize("a\r\nb\r\n")).toBe("a\nb\n");
  });
});

describe("invariants", () => {
  const cited = { ".agents/a.md": "- **Claim.** Checked: INV:a/two-words.\n" };
  const anchored = '// @anchor INV:a/two-words\ntest("x", () => {});\n';

  test("an anchor above its test and cited by a document passes", () => {
    expect(problems(cited, { "test/a.test.ts": anchored })).toEqual([]);
  });

  test("the anchor must sit directly above test(", () => {
    expect(
      problems(cited, { "test/a.test.ts": `// @anchor INV:a/two-words\n\ntest("x", () => {});\n` }),
    ).toEqual(["test/a.test.ts:1: INV:a/two-words must sit directly above test(...)"]);
  });

  test("ids are unique, shaped <area>/<two-words> and named after their file", () => {
    expect(problems(cited, { "test/a.test.ts": anchored + anchored })).toContain(
      "test/a.test.ts:3: duplicate INV:a/two-words",
    );
    expect(problems(cited, { "test/b.test.ts": anchored }).join("\n")).toMatch(/file's name/);
    expect(
      problems(
        { ".agents/a.md": "Checked: INV:a/one.\n" },
        { "test/a.test.ts": '// @anchor INV:a/one\ntest("x", () => {});\n' },
      ).join("\n"),
    ).toMatch(/not <area>/);
  });

  test("a cited id must exist and an anchor must be cited", () => {
    expect(problems(cited, {})).toEqual([
      ".agents/a.md:1: cites INV:a/two-words, which no test holds",
    ]);
    expect(problems({}, { "test/a.test.ts": anchored })).toEqual([
      "test/a.test.ts:1: INV:a/two-words is cited by no document",
    ]);
  });

  test("a citation inside a code fence does not count", () => {
    expect(problems({ ".agents/a.md": "```\nChecked: INV:a/two-words\n```\n" }, {})).toEqual([]);
  });
});

describe("workarounds", () => {
  const doc = { ".agents/workarounds/slow-disk.md": workaround("slow-disk") };
  const code = { "src/a.ts": "// @anchor WORKAROUND:slow-disk The disk is slow.\nconst a = 1;\n" };

  test("a document and an anchor pass together", () => {
    expect(problems(doc, code)).toEqual([]);
  });

  test("each side needs the other", () => {
    expect(problems(doc, {}).join("\n")).toMatch(/no @anchor WORKAROUND:slow-disk/);
    expect(problems({}, code).join("\n")).toMatch(/WORKAROUND:slow-disk has no document/);
  });

  test("the anchor carries its reason", () => {
    const bare = { "src/a.ts": "// @anchor WORKAROUND:slow-disk\nconst a = 1;\n" };
    expect(problems(doc, bare).join("\n")).toMatch(/needs its reason/);
  });

  test("code: none needs why and no anchors", () => {
    const none = (extra: string) => ({
      ".agents/workarounds/slow-disk.md": workaround("slow-disk", extra),
    });
    expect(problems(none("code: none\nwhy: Nothing to mark.\n"), {})).toEqual([]);
    expect(problems(none("code: none\n"), {}).join("\n")).toMatch(/needs "why:"/);
    expect(problems(none("code: none\nwhy: Nothing.\n"), code).join("\n")).toMatch(/has anchors/);
  });

  test("a document says how it is checked", () => {
    const unchecked = `---\nanchor: WORKAROUND:x\nrule: R.\n---\nBody.\n`;
    expect(problems({ ".agents/workarounds/x.md": unchecked }, {}).join("\n")).toMatch(
      /Not checked automatically/,
    );
  });

  test("a stale index fails", () => {
    const repo = repoOf(doc, code);
    const stale = {
      ...repo,
      docs: repo.docs.map((file) => (file.path === INDEX ? { ...file, text: "old\n" } : file)),
    };
    expect(checkDocs(stale)).toEqual([`${INDEX} is stale: run bun scripts/check-docs.ts --write`]);
  });
});

describe("module anchors", () => {
  const page = { ".agents/store.md": "# Store\n" };

  test("resolve to a page and sit on an entry point", () => {
    const open = { "src/a.ts": "/** @anchor DOC:store */\nexport const openStore = () => 1;\n" };
    expect(problems(page, open)).toEqual([]);
    expect(problems({}, open).join("\n")).toMatch(/store.md does not exist/);
  });

  test("are refused on an ordinary function", () => {
    const helper = { "src/a.ts": "/** @anchor DOC:store */\nexport const trim = () => 1;\n" };
    expect(problems(page, helper).join("\n")).toMatch(/entry point/);
  });
});

describe("anchor namespaces", () => {
  test("unknown namespaces and bare markers are refused", () => {
    expect(problems({}, { "src/a.ts": "// @anchor FOO:bar why\n" }).join("\n")).toMatch(/unknown/);
    expect(problems({}, { "src/a.ts": "// WORKAROUND: slow disk\n" }).join("\n")).toMatch(/bare/);
    expect(problems({}, { "src/a.ts": "/** DOC:store */\n" }).join("\n")).toMatch(/bare/);
  });

  test("WORKAROUND and DOC do not belong in test files", () => {
    const inTest = { "test/a.test.ts": "// @anchor WORKAROUND:slow-disk Reason.\n" };
    expect(problems({}, inTest).join("\n")).toMatch(/in a test file/);
  });
});

describe("comment conventions", () => {
  test("non-English comments fail, strings may hold any language", () => {
    expect(problems({}, { "src/a.ts": "// комментарий\n" }).join("\n")).toMatch(/English/);
    expect(problems({}, { "src/a.ts": 'const a = "готово";\n' })).toEqual([]);
  });

  test("references to specs, plans and tickets fail outside inline code", () => {
    for (const comment of [
      "// see §4.2",
      "// per the spec",
      "// from PLAN_OFFLINE",
      "// ABC-123",
    ]) {
      expect(problems({}, { "src/a.ts": `${comment}\n` }).join("\n")).toMatch(/references/);
    }
    expect(problems({}, { "src/a.ts": "// `docs: close ABC-123`, UTF-8\n" })).toEqual([]);
  });

  test("runs over 3 line comments and blocks over 10 lines fail", () => {
    expect(problems({}, { "src/a.ts": "// a\n// b\n// c\n" })).toEqual([]);
    expect(problems({}, { "src/a.ts": "// a\n// b\n// c\n// d\n" }).join("\n")).toMatch(/in a row/);
    expect(problems({}, { "src/a.ts": `/*${"\n".repeat(10)}*/\n` }).join("\n")).toMatch(/over 10/);
  });

  test("test files stay out of the comment conventions", () => {
    expect(problems({}, { "test/a.test.ts": "// комментарий\n" })).toEqual([]);
  });
});
