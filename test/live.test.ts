import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { withoutLiveBlocks } from "../src/core/live/blocks.ts";
import { fillLiveBlocks } from "../src/core/live/fill.ts";
import { liveBlockStale, writePlace } from "../src/core/rules/builtin/live.ts";
import { openStore, parseDocument } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const SANDBOX = join(ROOT, "sandbox");
const store = await openStore({ cwd: SANDBOX, store: SANDBOX, today: TODAY });

const fill = (text: string, rel = "NOTES.md") => fillLiveBlocks(text, rel, store.index);

const block = (open: string) =>
  `${open}\nstale\n<!-- /trove:${open.match(/trove:(\w+)/)?.[1]} -->\n`;

describe("live blocks", () => {
  test("items take filters and layout options, links relative to the document", () => {
    const { text, problems } = fill(
      block('<!-- trove:items owner=mobile as=list format="{id} in {document}" -->'),
      "notes/NOTES.md",
    );
    expect(problems).toEqual([]);
    expect(text).toContain("- MOB1-1 in [AUDIT_MOBILE_1](../audits/mobile/AUDIT_MOBILE_1.md)");
    expect(text).not.toContain("stale");
  });

  test("the filter header adds to every block", () => {
    const head = "---\nfilter: path=!audits/AUDIT_WEB_1.md\n---\n";
    const { text } = fill(`${head}${block("<!-- trove:items status=open as=ids -->")}`);
    expect(text).toContain("API2-1, API2-2");
    expect(text).not.toContain("WEB1-");
  });

  test("a column can be relabelled", () => {
    const { text } = fill(
      block("<!-- trove:items owner=api priority=P0 columns=id,document:audit -->"),
    );
    expect(text).toContain("| id | audit |");
  });

  test("counts and documents", () => {
    const counts = fill(block("<!-- trove:counts owner=api by=priority -->")).text;
    expect(counts).toContain("| P0 | 1 |");
    const byDocument = fill(block("<!-- trove:counts owner=api by=document label=audit -->")).text;
    expect(byDocument).toContain("| audit | count |");
    expect(byDocument).toContain("| [AUDIT_API_2](audits/AUDIT_API_2.md) | 3 |");
    const docs = fill(block("<!-- trove:documents type=study as=list -->")).text;
    expect(docs).toContain("[STUDY_RECONNECT_STORMS](research/STUDY_RECONNECT_STORMS.md)");
  });

  test("CRLF stays CRLF", () => {
    const { text } = fill(block("<!-- trove:items owner=api as=ids -->").replaceAll("\n", "\r\n"));
    expect(text.replaceAll("\r\n", "")).not.toContain("\n");
  });

  test("bad blocks are left alone and reported", () => {
    const unknown = block("<!-- trove:nope -->");
    expect(fill(unknown)).toMatchObject({ text: unknown });
    expect(fill(unknown).problems[0]?.message).toContain("nope");
    expect(fill("<!-- trove:items -->\nno end\n").problems[0]?.message).toContain("never closed");
  });

  test("text without blocks keeps the markers, drops what is between them", () => {
    expect(withoutLiveBlocks(`a\n${block("<!-- trove:items -->")}b`)).toBe(
      "a\n<!-- trove:items -->\n<!-- /trove:items -->\nb",
    );
  });
});

describe("rules on generated blocks and write places", () => {
  const doc = (rel: string, body: string) =>
    parseDocument(
      { path: join(SANDBOX, rel), rel, text: `---\ntype: summary\n---\n${body}` },
      store.config,
    );
  const context = { index: store.index, config: store.config };
  const body = `${block("<!-- trove:items owner=api as=ids -->")}<!-- write: why -->\n`;

  test("a work document reports stale blocks and empty write places", () => {
    const work = doc("summaries/SUMMARY_X.md", body);
    expect(liveBlockStale.check(work, context)).toHaveLength(1);
    expect(writePlace.check(work)).toMatchObject([{ line: 7 }]);
  });

  test("an archived document is a snapshot", () => {
    const archived = doc(".archive/summaries/SUMMARY_X.md", body);
    expect(liveBlockStale.check(archived, context)).toEqual([]);
    expect(writePlace.check(archived)).toEqual([]);
  });
});
