import { describe, expect, test } from "bun:test";
import { findBlock } from "../src/core/markdown/blocks.ts";
import { fencedLines } from "../src/core/markdown/fences.ts";
import { parseFrontMatter } from "../src/core/markdown/front-matter.ts";
import { parseHeadings } from "../src/core/markdown/headings.ts";
import { findLinks } from "../src/core/markdown/links.ts";
import { parseTables } from "../src/core/markdown/tables.ts";
import { splitLines } from "../src/core/text/lines.ts";

describe("splitLines", () => {
  test("keeps offsets into the original CRLF text", () => {
    const text = "a\r\nbc\nd";
    const lines = splitLines(text);
    expect(lines.map((line) => line.text)).toEqual(["a", "bc", "d"]);
    expect(lines.map((line) => text.slice(line.start, line.end))).toEqual(["a", "bc", "d"]);
    expect(lines[1]?.number).toBe(2);
  });
});

describe("parseFrontMatter", () => {
  test("reads free-text values and strips one pair of quotes", () => {
    const lines = splitLines('---\ntype: audit\nscope: "a: b, c"\nverify: x — `y: z`\n---\nbody');
    const front = parseFrontMatter(lines);
    expect(front?.fields.get("scope")?.value).toBe("a: b, c");
    expect(front?.fields.get("verify")?.value).toBe("x — `y: z`");
    expect(front?.endLine).toBe(5);
  });

  test("is missing without an opening or closing fence", () => {
    expect(parseFrontMatter(splitLines("# title"))).toBeUndefined();
    expect(parseFrontMatter(splitLines("---\ntype: audit"))).toBeUndefined();
  });
});

describe("parseHeadings", () => {
  const text = "# A\n## B\ntext\n```\n## not a heading\n```\n### C\n## D\n";
  const lines = splitLines(text);
  const headings = parseHeadings(lines, fencedLines(lines), text.length);

  test("skips headings inside fenced code", () => {
    expect(headings.map((heading) => heading.title)).toEqual(["A", "B", "C", "D"]);
  });

  test("ends a section at the next heading of the same or higher level", () => {
    const b = headings[1];
    expect(b && text.slice(b.start, b.end)).toBe("## B\ntext\n```\n## not a heading\n```\n### C\n");
  });
});

describe("parseTables", () => {
  test("splits header from rows and every pipe into a cell", () => {
    const [table] = parseTables(splitLines("| id | what |\n| -- | ---- |\n| A-1 | x | y |"));
    expect(table?.header?.cells).toEqual(["id", "what"]);
    expect(table?.rows[0]?.cells).toEqual(["A-1", "x", "y"]);
  });
});

describe("findBlock", () => {
  test("pairs markers and leaves an unclosed block open to the end", () => {
    const lines = splitLines("x\n<!-- ledger -->\n| a |\n<!-- /ledger -->\n<!-- prompt -->\ntask");
    const fenced = fencedLines(lines);
    expect(findBlock(lines, fenced, "ledger")?.inner.map((line) => line.text)).toEqual(["| a |"]);
    expect(findBlock(lines, fenced, "prompt")?.close).toBeUndefined();
    expect(findBlock(lines, fenced, "missing")).toBeUndefined();
  });
});

describe("findLinks", () => {
  test("keeps relative targets, drops URLs, absolute and angle-bracket targets and fenced code", () => {
    const lines = splitLines(
      "[a](../x.md#L5) [b](https://e.com) [c](/abs) [d](</Users/me/f.md>) [e](#top)\n```\n[f](y.md)\n```\n[g](dir/z.ts)",
    );
    expect(findLinks(lines, fencedLines(lines)).map((link) => `${link.line}:${link.path}`)).toEqual(
      ["1:../x.md", "5:dir/z.ts"],
    );
  });

  test("a link-like text inside inline code is not a link; code inside link text is", () => {
    const lines = splitLines("title `A](x) B` stays whole, [`f.ts:3`](src/f.ts#L3) links");
    expect(findLinks(lines, fencedLines(lines)).map((link) => link.path)).toEqual(["src/f.ts"]);
  });
});
