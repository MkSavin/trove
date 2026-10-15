#!/usr/bin/env bun
// The whole store lifecycle through the real CLI, in a throwaway workspace.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli", "main.ts");
const workspace = await mkdtemp(join(tmpdir(), "trove-e2e-"));
const app = join(workspace, "app");
const env = {
  ...process.env,
  TROVE_HOME: join(workspace, "home"),
  CLAUDE_CONFIG_DIR: join(workspace, "claude"),
  GIT_AUTHOR_NAME: "trove e2e",
  GIT_AUTHOR_EMAIL: "e2e@example.com",
  GIT_COMMITTER_NAME: "trove e2e",
  GIT_COMMITTER_EMAIL: "e2e@example.com",
};

const trove = async (args: string[], expected = 0): Promise<string> => {
  const result = await Bun.$`bun ${CLI} ${args}`.cwd(app).env(env).quiet().nothrow();
  const output = `${result.stdout}${result.stderr}`;
  console.log(`$ trove ${args.join(" ")}\n${output}`);
  if (result.exitCode !== expected) {
    throw new Error(`trove ${args[0]} exited ${result.exitCode}, expected ${expected}`);
  }
  return output;
};

try {
  await mkdir(join(app, "web"), { recursive: true });
  await Bun.$`git init --quiet`.cwd(app);
  await trove(["init", "--yes", "--lang", "en"]);
  const remote = join(workspace, "remote.git");
  await Bun.$`git init --quiet --bare --initial-branch=main ${remote}`.env(env);
  await trove(["remote", "add", remote]);
  await trove(["doc", "new", "audit", "web client", "--scope", "web/"]);
  await trove([
    "item",
    "add",
    "AUDIT_WEB_CLIENT_1",
    "priority=P1",
    "owner=web",
    "what=Offline sends are lost",
  ]);
  await trove([
    "item",
    "add",
    "AUDIT_WEB_CLIENT_1",
    "priority=P3",
    "owner=web",
    "what=No focus ring",
  ]);
  await trove(["item", "close", "WEBCLIENT1-1", "--commit", "3f2a9c1"]);
  await trove(["item", "close", "WEBCLIENT1-2"], 1);
  await trove(["item", "close", "WEBCLIENT1-2", "--archive"]);
  await trove(["doc", "new", "plan", "offline mode", "--scope", "web/"]);
  await trove(["check"]);
  const query = await trove(["query", "documents", "place=archive"]);
  if (!query.includes(".archive/audits/AUDIT_WEB_CLIENT_1.md"))
    throw new Error("audit not archived");
  await trove(["client", "add", "codex"]);
  if (
    !(await Bun.file(join(app, ".codex", "config.toml")).text()).includes("[mcp_servers.trove]")
  ) {
    throw new Error("codex was not connected");
  }
  await trove(["client", "add", "claude", "--local"]);
  const claudeJson = await Bun.file(join(workspace, "claude", ".claude.json")).text();
  if (!claudeJson.includes('"trove"') || (await Bun.file(join(app, ".mcp.json")).exists())) {
    throw new Error("claude was not connected for this machine only");
  }
  await trove(["client", "add", "cursor", "--local"], 2);
  await trove(["doctor"]);
  const pushed = await Bun.$`git log --format=%s main`.cwd(remote).env(env).quiet().text();
  if (!pushed.includes("docs: close WEBCLIENT1-2, archive AUDIT_WEB_CLIENT_1")) {
    throw new Error(`operations did not reach the remote:\n${pushed}`);
  }
  console.log("e2e ✔");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
