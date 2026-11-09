import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { git } from "../src/core/git/git.ts";
import { ROOT } from "./helpers.ts";

const KILL_AFTER_MS = 15_000;

let workspace = "";

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-git-"));
  await git(workspace, ["init", "--quiet"]);
});

afterEach(() => rm(workspace, { recursive: true, force: true, maxRetries: 5 }));

describe("git child processes", () => {
  // @anchor INV:git/hook-variables
  test("a hook's git variables do not steer a repository elsewhere", async () => {
    process.env.GIT_DIR = join(workspace, "elsewhere");
    try {
      expect(await git(workspace, ["rev-parse", "--is-inside-work-tree"])).toMatchObject({
        ok: true,
        out: "true",
      });
    } finally {
      delete process.env.GIT_DIR;
    }
  });

  // @anchor INV:git/closed-stdin
  test("a git child never reads the parent's stdin, which stays open", async () => {
    const module = pathToFileURL(join(ROOT, "src", "core", "git", "git.ts")).href;
    const script = join(workspace, "reader.ts");
    await Bun.write(
      script,
      `import { git } from ${JSON.stringify(module)};
const read = await git(process.cwd(), ["-c", "alias.readin=!cat", "readin"]);
console.log(JSON.stringify(read));`,
    );
    const child = Bun.spawn(["bun", script], {
      cwd: workspace,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });
    child.stdin.write("a line of the protocol\n");
    await child.stdin.flush();
    const guard = setTimeout(() => child.kill(), KILL_AFTER_MS);
    const output = await new Response(child.stdout).text();
    clearTimeout(guard);
    child.kill();
    expect(JSON.parse(output)).toMatchObject({ ok: true, out: "" });
  });
});
