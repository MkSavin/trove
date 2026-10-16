import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { run } from "../src/cli/run.ts";
import { captureIo, FIXTURE, ROOT } from "./helpers.ts";

const STORE = ["--store", FIXTURE];

describe("trove", () => {
  test("prints help and version", async () => {
    const io = captureIo();
    expect(await run([], io)).toBe(0);
    expect(io.stdout()).toContain("check");
    const version = captureIo();
    await run(["--version"], version);
    expect(version.stdout().trim()).toBe(packageJson.version);
  });

  test("rejects unknown commands and flags with exit code 2", async () => {
    const io = captureIo();
    expect(await run(["bogus"], io)).toBe(2);
    expect(await run(["check", "--bogus", ...STORE], io)).toBe(2);
    expect(io.stderr()).toContain("unknown command bogus");
  });

  test("check fails on errors and narrows to one file", async () => {
    const all = captureIo();
    expect(await run(["check", ...STORE], all)).toBe(1);
    expect(all.stdout()).toContain("✖ 22 errors");

    const one = captureIo();
    expect(await run(["check", "prompts/PROMPT_GOOD.md", ...STORE], one)).toBe(0);
    expect(one.stdout()).toContain("✔ 0 errors");
  });

  test("check --json is machine-readable", async () => {
    const io = captureIo();
    await run(["check", "--json", ...STORE], io);
    const parsed = JSON.parse(io.stdout());
    expect(parsed.diagnostics).toBeArrayOfSize(24);
  });

  test("report refuses to write while check is red", async () => {
    const io = captureIo();
    expect(await run(["report", ...STORE], io)).toBe(1);
    expect(io.stdout()).toContain("reports not written");
  });

  test("query prints the matched ledgers' columns or the ones asked for", async () => {
    const sandbox = ["--store", join(ROOT, "sandbox")];
    const fitted = captureIo();
    await run(["query", "items", "type=debt", ...sandbox], fitted);
    expect(fitted.stdout().split("\n")[0]?.split(/\s+/)).toEqual([
      "id",
      "status",
      "what",
      "plan",
      "document",
    ]);

    const chosen = captureIo();
    await run(["query", "items", "type=debt", "--columns", "id, plan", ...sandbox], chosen);
    expect(chosen.stdout().split("\n")[0]?.split(/\s+/)).toEqual(["id", "plan"]);
  });

  test("query pages long lists and says how to read on", async () => {
    const sandbox = ["--store", join(ROOT, "sandbox")];
    const all = captureIo();
    await run(["query", "items", "--brief", ...sandbox], all);
    const [header, ...rows] = all.stdout().trim().split("\n");
    expect(header?.split(/\s+/)).toEqual(["id", "what"]);
    const total = rows.length - 1;
    expect(rows.at(-1)).toBe(`${total} items`);

    const page = captureIo();
    await run(["query", "items", "--brief", "--limit", "2", "--offset", "1", ...sandbox], page);
    const lines = page.stdout().trim().split("\n");
    expect(lines.slice(1, 3)).toEqual(rows.slice(1, 3));
    expect(lines.at(-1)).toBe(`showing 2-3 of ${total} items; pass --offset 3`);

    const json = captureIo();
    await run(["query", "items", "--limit", "1", "--json", ...sandbox], json);
    expect(JSON.parse(json.stdout())).toBeArrayOfSize(1);
    expect(json.stderr()).toBe(`showing 1 of ${total} items; pass --offset 1\n`);
  });

  test("query and show answer from the index", async () => {
    const query = captureIo();
    await run(["query", "items", "owner=backend", "--fields", "id,what", ...STORE], query);
    expect(query.stdout()).toContain("GOOD1-3  Server item without a module column");

    const show = captureIo();
    await run(["show", "GOOD1-10", ...STORE], show);
    expect(show.stdout()).toStartWith("audits/AUDIT_GOOD_1.md:44\n\n### GOOD1-10. Tenth item");
  });

  test("prompt prints the task text after the marker", async () => {
    const io = captureIo();
    await run(["prompt", "PROMPT_GOOD", ...STORE], io);
    expect(io.stdout()).toBe("Проверь подсистему и заведи аудит.\nВторая строка задания.\n");
  });
});
