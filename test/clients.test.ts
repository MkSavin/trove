import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { afterEdit, atStop } from "../src/clients/claude/hooks.ts";
import { SERVER, SERVER_NAME } from "../src/clients/clients.ts";
import { installClient } from "../src/clients/install.ts";
import { SKILLS } from "../src/clients/skills.ts";
import { git } from "../src/core/git/git.ts";
import { ROOT } from "./helpers.ts";

const IDENTITY = {
  GIT_AUTHOR_NAME: "trove test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "trove test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

let workspace = "";

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-clients-"));
  Object.assign(process.env, IDENTITY);
});

afterEach(() => rm(workspace, { recursive: true, force: true, maxRetries: 5 }));

const read = (rel: string) => Bun.file(join(workspace, rel)).text();

describe("client add", () => {
  test("claude: merges into .mcp.json and writes the skills, idempotently", async () => {
    await Bun.write(join(workspace, ".mcp.json"), '{"mcpServers":{"other":{"command":"x"}}}');
    await installClient(workspace, "claude");
    await installClient(workspace, "claude");
    expect(JSON.parse(await read(".mcp.json")).mcpServers).toEqual({
      other: { command: "x" },
      [SERVER_NAME]: SERVER,
    });
    expect(await read(".claude/skills/trove-store/SKILL.md")).toBe(SKILLS["trove-store"] ?? "");
  });

  test("cursor and codex use their own files", async () => {
    await installClient(workspace, "cursor");
    expect(JSON.parse(await read(".cursor/mcp.json")).mcpServers.trove).toEqual(SERVER);
    expect(await Bun.file(join(workspace, ".cursor/skills/trove-migrate/SKILL.md")).exists()).toBe(
      true,
    );

    await Bun.write(join(workspace, ".codex/config.toml"), 'model = "gpt"\n');
    await installClient(workspace, "codex");
    await installClient(workspace, "codex");
    const toml = await read(".codex/config.toml");
    expect(toml.match(/\[mcp_servers\.trove\]/g)).toHaveLength(1);
    expect(Bun.TOML.parse(toml)).toEqual({
      model: "gpt",
      mcp_servers: { trove: { command: "trove", args: ["mcp"] } },
    });
    expect(await Bun.file(join(workspace, ".agents/skills/trove-store/SKILL.md")).exists()).toBe(
      true,
    );
  });

  test("refuses to overwrite a broken config", async () => {
    await Bun.write(join(workspace, ".mcp.json"), "{ not json");
    await expect(installClient(workspace, "claude")).rejects.toThrow(/not valid JSON/);
  });
});

describe("claude code hooks", () => {
  const store = async (mode: "off" | "commit" = "off"): Promise<string> => {
    const root = join(workspace, "store");
    await cp(join(ROOT, "sandbox"), root, { recursive: true });
    const config = Bun.file(join(root, "trove.yaml"));
    await Bun.write(config, (await config.text()).replace("sync: off", `sync: ${mode}`));
    await git(root, ["init", "--quiet"]);
    await git(root, ["add", "--all"]);
    await git(root, ["commit", "--quiet", "-m", "base"]);
    return root;
  };

  test("after an edit: silent outside stores and for clean documents", async () => {
    const root = await store();
    expect(await afterEdit({ tool_input: { file_path: join(workspace, "notes.md") } })).toEqual({
      code: 0,
      message: "",
    });
    expect((await afterEdit({ tool_input: { file_path: join(root, "RISKS.md") } })).code).toBe(0);
    expect((await afterEdit({ tool_input: { file_path: join(root, "trove.yaml") } })).code).toBe(0);
  });

  test("after an edit: errors and generated files go back to the model", async () => {
    const root = await store();
    const risks = join(root, "RISKS.md");
    await Bun.write(
      risks,
      (await Bun.file(risks).text()).replace("status: current", "status: done"),
    );
    const broken = await afterEdit({ tool_input: { file_path: risks } });
    expect(broken.code).toBe(2);
    expect(broken.message).toContain("RISKS.md:3 known-status: unknown status: done");

    const generated = await afterEdit({ tool_input: { file_path: join(root, "BACKLOG.md") } });
    expect(generated).toMatchObject({ code: 2, message: expect.stringContaining("generated") });
  });

  test("at stop: syncs hand edits only when the store syncs and is green", async () => {
    const quiet = await store("off");
    await Bun.write(
      join(quiet, "RISKS.md"),
      `${await Bun.file(join(quiet, "RISKS.md")).text()}\nMore.\n`,
    );
    expect((await atStop({ cwd: quiet })).code).toBe(0);
    expect((await git(quiet, ["log", "--format=%s"])).out).toBe("base");
    await rm(quiet, { recursive: true, force: true, maxRetries: 5 });

    const root = await store("commit");
    await Bun.write(
      join(root, "RISKS.md"),
      `${await Bun.file(join(root, "RISKS.md")).text()}\nMore.\n`,
    );
    expect(await atStop({ cwd: root, stop_hook_active: true })).toEqual({ code: 0, message: "" });
    expect((await atStop({ cwd: root })).code).toBe(0);
    expect((await git(root, ["log", "--format=%s"])).out.split("\n")[0]).toBe(
      "docs: sync session edits",
    );

    await Bun.write(join(root, "plans", "PLAN_BROKEN.md"), "no header\n");
    expect(await atStop({ cwd: root })).toMatchObject({ code: 1 });
  });

  test("the CLI reads the hook input from stdin", async () => {
    const root = await store();
    const risks = join(root, "RISKS.md");
    await Bun.write(
      risks,
      (await Bun.file(risks).text()).replace("status: current", "status: done"),
    );
    const child = Bun.spawn(["bun", join(ROOT, "src", "cli", "main.ts"), "hook", "post-edit"], {
      stdin: new Blob([JSON.stringify({ tool_input: { file_path: risks } })]),
      stderr: "pipe",
    });
    expect(await child.exited).toBe(2);
    expect(await new Response(child.stderr).text()).toContain("unknown status: done");
  });
});

describe("plugin package", () => {
  const plugin = (rel: string) => Bun.file(join(ROOT, "plugin", rel)).json();

  test("its manifest version follows package.json", async () => {
    expect((await plugin(".claude-plugin/plugin.json")).version).toBe(packageJson.version);
  });

  test("its MCP server, hooks and skills match what trove installs", async () => {
    expect((await plugin(".mcp.json")).mcpServers[SERVER_NAME]).toEqual(SERVER);
    const hooks = JSON.stringify(await plugin("hooks/hooks.json"));
    expect(hooks).toContain('["hook","post-edit"]');
    expect(hooks).toContain('["hook","stop"]');
    expect((await readdir(join(ROOT, "plugin", "skills"))).toSorted()).toEqual(
      Object.keys(SKILLS).toSorted(),
    );
  });
});
