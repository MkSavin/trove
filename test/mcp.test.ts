import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createServer } from "../src/mcp/server.ts";
import { ROOT } from "./helpers.ts";

let root = "";
let client: Client;

type TextResult = { content: { type: string; text?: string }[]; isError?: boolean };

const call = async (name: string, args: Record<string, unknown>) => {
  const result = (await client.callTool({ name, arguments: args })) as TextResult;
  const body = result.content[0]?.text ?? "";
  return { error: result.isError === true, body, data: () => JSON.parse(body) };
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "trove-mcp-"));
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await createServer({ cwd: root }).connect(serverEnd);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientEnd);
});

afterEach(async () => {
  await client.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

describe("mcp tools", () => {
  test("a small, stable set of tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual([
      "trove_check",
      "trove_create",
      "trove_item",
      "trove_prompt",
      "trove_query",
      "trove_regulation",
      "trove_report",
      "trove_show",
      "trove_summary",
      "trove_sync",
      "trove_transition",
      "trove_update",
    ]);
  });

  test("read slices: query, show, check, prompt, regulation", async () => {
    const query = (
      await call("trove_query", {
        kind: "items",
        filters: { owner: "api", priority: ["P0", "P1"] },
      })
    ).data();
    expect(query.rows.map((row: { id: string }) => row.id)).toEqual(["API2-1", "API2-2"]);

    expect((await call("trove_show", { ref: "WEB1-4" })).body).toStartWith(
      "audits/AUDIT_WEB_1.md:",
    );
    expect((await call("trove_check", {})).data()).toMatchObject({ documents: 20, errors: 0 });
    expect((await call("trove_prompt", { name: "PROMPT_AUDIT_WEB" })).body).toStartWith("# Task:");
    expect((await call("trove_regulation", { topic: "ledger" })).body).toContain(
      "| `owner` | owner | yes |",
    );
  });

  test("query pages rows and notes how to read on", async () => {
    const all = (await call("trove_query", { kind: "items", brief: true })).data();
    expect(Object.keys(all.rows[0])).toEqual(["id", "what"]);
    expect(all.note).toBeUndefined();

    const page = (await call("trove_query", { kind: "items", limit: 2, offset: 2 })).data();
    expect(page.rows.map((row: { id: string }) => row.id)).toEqual(
      all.rows.slice(2, 4).map((row: { id: string }) => row.id),
    );
    expect(page).toMatchObject({
      total: all.total,
      note: `showing 3-4 of ${all.total}; pass offset=4`,
    });

    const last = (
      await call("trove_query", { kind: "documents", brief: true, offset: 999 })
    ).data();
    expect(last.rows).toEqual([]);
    expect(last.note).toStartWith("showing none of ");
  });

  test("a second call reuses the parsed store and sees edits made on disk", async () => {
    const before = (await call("trove_query", { kind: "items", filters: { id: "API2-1" } })).data();
    expect(before.rows[0].what).toStartWith("A refresh token");
    const audit = join(root, "audits", "AUDIT_API_2.md");
    const text = await Bun.file(audit).text();
    await Bun.write(audit, text.replace("A refresh token stays", "A refresh token remains"));
    const after = (await call("trove_query", { kind: "items", filters: { id: "API2-1" } })).data();
    expect(after.rows[0].what).toStartWith("A refresh token remains");
  });

  test("an item closes with a dry run first, then for real", async () => {
    const dry = (await call("trove_item", { action: "close", id: "WEB1-3", dryRun: true })).data();
    expect(dry.written).toBe(false);
    expect(dry.files[0]).toMatchObject({ status: "modified", path: "audits/AUDIT_WEB_1.md" });
    expect(dry.files[1]).toMatchObject({
      status: "modified",
      path: "audits/AUDIT_WEB_1.RESOLVED.md",
    });

    const done = (await call("trove_item", { action: "close", id: "WEB1-3" })).data();
    expect(done.written).toBe(true);
    expect(await Bun.file(join(root, "BACKLOG.md")).text()).not.toContain("| WEB1-3 |");
  });

  test("refusals explain what is missing instead of writing", async () => {
    const archive = (
      await call("trove_transition", { document: "AUDIT_WEB_1", to: "archive" })
    ).data();
    expect(archive.written).toBe(false);
    expect(archive.errors.map((e: { rule: string }) => e.rule)).toEqual(["lifecycle"]);

    const add = await call("trove_item", { action: "add", values: { what: "x" } });
    expect(add).toMatchObject({ error: true, body: "document is required for this action" });
  });

  test("create and update keep the store green", async () => {
    const created = (
      await call("trove_create", {
        type: "plan",
        topic: "search rollout",
        fields: { scope: "api/" },
      })
    ).data();
    expect(created.files[0]).toMatchObject({
      status: "added",
      path: "plans/PLAN_SEARCH_ROLLOUT.md",
    });
    const updated = (
      await call("trove_update", { document: "PLAN_SEARCH_ROLLOUT", field: "checked" })
    ).data();
    expect(updated.written).toBe(true);
    expect((await call("trove_check", { severity: "error" })).data().errors).toBe(0);
  });
});

describe("mcp resources", () => {
  test("regulation topics and the config", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain("trove://regulation/workflow");
    const types = await client.readResource({ uri: "trove://regulation/types" });
    expect(JSON.stringify(types.contents)).toContain("ledger, series, status-line, freshness");
    const config = await client.readResource({ uri: "trove://config" });
    expect(JSON.stringify(config.contents)).toContain("regulation: 1");
  });
});

describe("trove mcp over stdio", () => {
  test("serves the store of its working folder", async () => {
    const transport = new StdioClientTransport({
      command: "bun",
      args: [join(ROOT, "src", "cli", "main.ts"), "mcp"],
      cwd: root,
    });
    const stdio = new Client({ name: "stdio-test", version: "1.0.0" });
    await stdio.connect(transport);
    try {
      const result = (await stdio.callTool({ name: "trove_check", arguments: {} })) as TextResult;
      expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({ errors: 0 });
    } finally {
      await stdio.close();
    }
  });
});
