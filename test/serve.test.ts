import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";
import { openStore } from "../src/core/store/open.ts";
import { renderMarkdown } from "../src/serve/markdown.ts";
import { serveStore } from "../src/serve/server.ts";
import { ROOT, TODAY } from "./helpers.ts";

const HOSTILE = `---
type: research
status: open
date: 2026-10-01
checked: 2026-10-01
scope: "web"
---

# RESEARCH_HOSTILE — <script>alert(1)</script>

**Status:** open. Checked 2026-10-01.

<script>alert(2)</script>

| what | where |
| --- | --- |
| <img src=x onerror=alert(3)> | [plan](../plans/PLAN_OFFLINE_MODE.md) |

[bad](javascript:alert(4)) and \`<b>code</b>\`
`;

let root: string;
let server: Server<undefined>;

const get = async (path: string, init?: RequestInit) => {
  const response = await fetch(new URL(path, server.url), init);
  return { status: response.status, headers: response.headers, text: await response.text() };
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "trove-serve-"));
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  await Bun.write(join(root, "research", "RESEARCH_HOSTILE.md"), HOSTILE);
  const open = async () => (await openStore({ cwd: root, store: root, today: TODAY })).index;
  server = serveStore({ port: 0, open });
});

afterAll(async () => {
  await server.stop(true);
  await rm(root, { recursive: true, force: true });
});

describe("trove serve", () => {
  test("binds to loopback only", () => {
    expect(server.hostname).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
  });

  test("lists documents and filters them with query syntax", async () => {
    const all = await get("/");
    expect(all.status).toBe(200);
    expect(all.text).toContain('<a href="/doc/audits/AUDIT_WEB_1.md">audits/AUDIT_WEB_1.md</a>');

    const plans = await get(`/?q=${encodeURIComponent("type=plan")}`);
    expect(plans.text).toContain("plans/PLAN_OFFLINE_MODE.md");
    expect(plans.text).not.toContain("audits/AUDIT_WEB_1.md");
  });

  test("lists items with chosen columns", async () => {
    const page = await get(
      `/items?q=${encodeURIComponent("status=open owner=api")}&columns=id,what`,
    );
    expect(page.text).toContain("API2-1");
    expect(page.text).not.toContain("DEBT-S1");
    expect(page.text).toContain("<th>what</th>");
  });

  test("renders a document with every piece of its HTML escaped", async () => {
    const page = await get("/doc/research/RESEARCH_HOSTILE.md");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(page.text).not.toContain("<script");
    expect(page.text).not.toContain("<img");
    expect(page.text).not.toContain("javascript:");
    expect(page.text).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(page.text).toContain("<code>&lt;b&gt;code&lt;/b&gt;</code>");
    expect(page.text).toContain('<a href="/doc/plans/PLAN_OFFLINE_MODE.md">plan</a>');
  });

  test("shows the live summary of a kind and the written ones", async () => {
    const page = await get("/summaries?kind=outside-web");
    expect(page.status).toBe(200);
    expect(page.text).toContain("<strong>Everything but the web audit</strong>");
    expect(page.text).toContain("summaries/SUMMARY_WEB.md");
  });

  test("reads the files again on every request", async () => {
    await Bun.write(
      join(root, "research", "RESEARCH_HOSTILE.md"),
      HOSTILE.replace("alert(2)", "changed"),
    );
    expect((await get("/doc/research/RESEARCH_HOSTILE.md")).text).toContain("changed");
  });

  test("answers bad filters, unknown pages, writes and foreign hosts with errors", async () => {
    expect((await get("/?q=nofilter")).status).toBe(400);
    expect((await get("/summaries?kind=nope")).status).toBe(400);
    expect((await get("/doc/NOPE.md")).status).toBe(404);
    expect((await get("/elsewhere")).status).toBe(404);
    expect((await get("/", { method: "POST" })).status).toBe(405);
    expect((await get("/", { headers: { host: "attacker.example" } })).status).toBe(403);
  });
});

describe("renderMarkdown", () => {
  const none = () => undefined;

  test("keeps the subset it knows and escapes the rest", () => {
    const html = renderMarkdown(
      "## Title\n\n- one\n- **two**\n\n```\n<x>\n```\n<!-- trove:block -->\n> quoted",
      none,
    );
    expect(html).toBe(
      [
        "<h2>Title</h2>",
        "<ul><li>one</li><li><strong>two</strong></li></ul>",
        "<pre><code>&lt;x&gt;</code></pre>",
        "<blockquote>quoted</blockquote>",
      ].join("\n"),
    );
  });

  test("shows links the resolver refuses as text", () => {
    expect(renderMarkdown('[a"b](x.ts)', none)).toBe("<p>a&quot;b</p>");
    expect(renderMarkdown("**[A](a.md)**", () => "/doc/a.md")).toBe(
      '<p><strong><a href="/doc/a.md">A</a></strong></p>',
    );
  });
});
