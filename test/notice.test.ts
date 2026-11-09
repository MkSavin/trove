import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { git } from "../src/core/git/git.ts";
import { createServer } from "../src/mcp/server.ts";
import { ROOT } from "./helpers.ts";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

type TextResult = { content: { type: string; text?: string }[]; isError?: boolean };

let root = "";
let client: Client | undefined;

const makeStore = async (mode: "off" | "commit", repository = true): Promise<void> => {
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  const config = Bun.file(join(root, "trove.yaml"));
  await Bun.write(config, (await config.text()).replace("sync: off", `sync: ${mode}`));
  if (!repository) return;
  await git(root, ["init", "--quiet"]);
  await git(root, ["add", "--all"]);
  await git(root, ["commit", "--quiet", "-m", "base"]);
};

const connect = async (statusTtlMs = 0): Promise<void> => {
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await createServer({ cwd: root, statusTtlMs }).connect(serverEnd);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientEnd);
};

const blocks = async (name: string, args: Record<string, unknown> = {}): Promise<string[]> => {
  const result = (await client?.callTool({ name, arguments: args })) as TextResult;
  return result.content.map((block) => block.text ?? "");
};

const editRisks = async (): Promise<void> => {
  const risks = join(root, "RISKS.md");
  await Bun.write(risks, `${await Bun.file(risks).text()}\nMore.\n`);
};

const READ = ["trove_regulation", { topic: "workflow" }] as const;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "trove-notice-"));
  Object.assign(process.env, IDENTITY);
});

afterEach(async () => {
  await client?.close();
  client = undefined;
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

describe("uncommitted-changes notice", () => {
  test("a dirty store: an extra block with the count, paths and what to do", async () => {
    await makeStore("commit");
    await connect();
    await editRisks();
    const [body, notice, ...rest] = await blocks(...READ);
    expect(body).not.toContain("before finishing");
    expect(rest).toEqual([]);
    expect(notice).toBe(
      "trove: 1 uncommitted file in the store (RISKS.md). Run trove_check, then trove_sync before finishing.",
    );
  });

  test("names only the first few paths, and reaches every kind of tool", async () => {
    await makeStore("commit");
    await connect();
    for (const name of ["a", "b", "c", "d", "e"]) await Bun.write(join(root, `${name}.txt`), "x");
    const [, notice] = await blocks("trove_check");
    expect(notice).toContain("trove: 5 uncommitted files");
    expect(notice).toContain("and 2 more");
    expect((await blocks("trove_query", { kind: "documents", brief: true })).length).toBe(2);
    expect((await blocks("trove_report")).length).toBe(2);
  });

  test("a failing tool keeps its error and still gets the notice", async () => {
    await makeStore("commit");
    await connect();
    await editRisks();
    const [body, notice] = await blocks("trove_show", { ref: "NOPE-1" });
    expect(body).not.toContain("before finishing");
    expect(notice).toContain("uncommitted");
  });

  test("absent when clean, when sync is off and outside a repository root", async () => {
    await makeStore("commit");
    await connect();
    expect(await blocks(...READ)).toHaveLength(1);
    await client?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });

    await makeStore("off");
    await connect();
    await editRisks();
    expect(await blocks(...READ)).toHaveLength(1);
    await client?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });

    await makeStore("commit", false);
    await connect();
    await editRisks();
    expect(await blocks(...READ)).toHaveLength(1);
  });

  // @anchor INV:notice/git-failure
  test("git failing never fails the tool", async () => {
    await makeStore("commit");
    await connect();
    await editRisks();
    await Bun.write(join(root, ".git", "HEAD"), "garbage\n");
    expect(await blocks(...READ)).toHaveLength(1);
  });

  test("read-only tools reuse the status; a tool that writes refreshes it", async () => {
    await makeStore("commit");
    await connect(60_000);
    expect(await blocks(...READ)).toHaveLength(1);
    await editRisks();
    expect(await blocks(...READ)).toHaveLength(1);

    expect(await blocks("trove_report")).toHaveLength(2);
    expect(await blocks(...READ)).toHaveLength(2);

    const [synced, stale] = await blocks("trove_sync");
    expect(synced).toContain("commit");
    expect(stale).toBeUndefined();
    expect(await blocks(...READ)).toHaveLength(1);
  });
});
