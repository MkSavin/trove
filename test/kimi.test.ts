import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, cp, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import { SERVER, SERVER_NAME } from "../src/clients/clients.ts";
import { afterEdit, atStop } from "../src/clients/hooks.ts";
import { addKimiHooks } from "../src/clients/kimi/hooks.ts";
import { kimiHome } from "../src/clients/kimi/local.ts";
import { SKILLS } from "../src/clients/skills.ts";
import { git } from "../src/core/git/git.ts";
import { captureIo, ROOT } from "./helpers.ts";

let workspace = "";
const savedHome = process.env.KIMI_CODE_HOME;

const home = () => join(workspace, "kimi");
const project = () => join(workspace, "app");
const configPath = () => join(home(), "config.toml");

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "trove-kimi-"));
  await mkdir(project());
  await git(project(), ["init", "--quiet"]);
  process.env.KIMI_CODE_HOME = home();
  process.env.TROVE_HOME = join(workspace, "trove-home");
});

afterEach(async () => {
  process.env.KIMI_CODE_HOME = savedHome;
  delete process.env.TROVE_HOME;
  await rm(workspace, { recursive: true, force: true, maxRetries: 5 });
});

const add = async (...args: string[]) => {
  const io = captureIo(project());
  const code = await run(["client", "add", ...args], io);
  return { code, out: io.stdout(), err: io.stderr() };
};

describe("client add kimi", () => {
  test("project: writes .kimi-code and touches no user-level file", async () => {
    await Bun.write(join(project(), ".kimi-code/mcp.json"), '{"mcpServers":{"other":{}}}');
    expect((await add("kimi")).code).toBe(0);
    expect(await Bun.file(join(project(), ".kimi-code/mcp.json")).json()).toEqual({
      mcpServers: { other: {}, [SERVER_NAME]: SERVER },
    });
    expect(await Bun.file(join(project(), ".kimi-code/skills/trove-store/SKILL.md")).text()).toBe(
      SKILLS["trove-store"] ?? "",
    );
    expect(await Bun.file(join(home(), "mcp.json")).exists()).toBe(false);
    expect(await Bun.file(configPath()).exists()).toBe(false);
  });

  test("--local: user level only, keeps other servers, says it reaches every project", async () => {
    await Bun.write(join(home(), "mcp.json"), '{"mcpServers":{"other":{"command":"x"}},"k":1}');
    const { code, out } = await add("kimi", "--local");
    expect(code).toBe(0);
    expect(out).toContain("every project on this machine");
    expect(await Bun.file(join(home(), "mcp.json")).json()).toEqual({
      k: 1,
      mcpServers: { other: { command: "x" }, [SERVER_NAME]: SERVER },
    });
    expect(await Bun.file(join(home(), "skills/trove-migrate/SKILL.md")).exists()).toBe(true);
    expect((await readdir(project())).filter((name) => name !== ".git")).toEqual([]);
    expect(await Bun.file(configPath()).exists()).toBe(false);
  });

  test("the home follows KIMI_CODE_HOME, else the home folder", () => {
    expect(kimiHome({ KIMI_CODE_HOME: "custom" }, "me")).toBe("custom");
    expect(kimiHome({}, "me")).toBe(join("me", ".kimi-code"));
  });

  test("--hooks is refused for a list without kimi", async () => {
    expect((await add("cursor", "--hooks")).code).toBe(2);
    expect(await Bun.file(join(project(), ".cursor/mcp.json")).exists()).toBe(false);
  });
});

describe("kimi hooks in config.toml", () => {
  const ALLOWED = ["command", "event", "matcher", "timeout"];

  test("appends valid entries with allowed keys only, once, and says what it did", async () => {
    await Bun.write(
      configPath(),
      'api_key = "secret"  # keep me\n\n[[hooks]]\nevent = "Stop"\ncommand = "other"',
    );
    const before = await Bun.file(configPath()).text();
    const first = await add("kimi", "--hooks");
    expect(first.out).toContain("user-level");
    expect(first.out).toContain("beta");
    const after = await Bun.file(configPath()).text();
    expect(after.startsWith(before)).toBe(true);

    expect((await add("kimi", "--hooks")).code).toBe(0);
    expect(await Bun.file(configPath()).text()).toBe(after);

    const { hooks, api_key } = Bun.TOML.parse(after) as {
      hooks: Record<string, unknown>[];
      api_key: string;
    };
    expect(api_key).toBe("secret");
    expect(hooks).toHaveLength(3);
    expect(hooks[1]).toEqual({
      event: "PostToolUse",
      matcher: "^(Write|Edit)$",
      command: "trove hook post-edit",
      timeout: 30,
    });
    expect(hooks[2]).toEqual({ event: "Stop", command: "trove hook stop", timeout: 120 });
    for (const hook of hooks.slice(1)) {
      expect(Object.keys(hook).filter((key) => !ALLOWED.includes(key))).toEqual([]);
    }
  });

  test("creates a missing file, and writes nothing without the flag", async () => {
    await add("kimi");
    expect(await Bun.file(configPath()).exists()).toBe(false);
    expect((await addKimiHooks(home())).added).toBe(2);
    expect(
      (Bun.TOML.parse(await Bun.file(configPath()).text()) as { hooks: [] }).hooks,
    ).toHaveLength(2);
  });

  test("keeps bytes text decoding would change, and the file's line endings", async () => {
    const bom = [0xef, 0xbb, 0xbf];
    const body = Buffer.from('name = "x"\r\n');
    const invalid = [0x23, 0xff, 0x0d, 0x0a];
    const original = Buffer.concat([Buffer.from(bom), body, Buffer.from(invalid)]);
    await Bun.write(configPath(), original);
    await addKimiHooks(home());
    const bytes = Buffer.from(await Bun.file(configPath()).bytes());
    expect(bytes.subarray(0, original.length).equals(original)).toBe(true);
    expect(bytes.subarray(original.length).toString()).toContain('[[hooks]]\r\nevent = "');
  });

  test("a commented-out entry does not count; only the missing entry is added", async () => {
    await Bun.write(configPath(), '# command = "trove hook stop"\n');
    expect((await addKimiHooks(home())).added).toBe(2);
    await Bun.write(configPath(), '[[hooks]]\nevent = "Stop"\ncommand = "trove hook stop"\n');
    expect((await addKimiHooks(home())).added).toBe(1);
  });

  test("refuses a config whose hooks cannot be appended to, leaving it alone", async () => {
    const inline = "hooks = []\n";
    await Bun.write(configPath(), inline);
    await expect(addKimiHooks(home())).rejects.toThrow(/another form/);
    expect(await Bun.file(configPath()).text()).toBe(inline);
  });

  test.skipIf(process.platform === "win32")("keeps a private config private", async () => {
    await Bun.write(configPath(), 'api_key = "secret"\n');
    await chmod(configPath(), 0o600);
    await addKimiHooks(home());
    expect((await stat(configPath())).mode & 0o777).toBe(0o600);
  });
});

describe("hooks with kimi input", () => {
  const store = async (mode: "off" | "commit" = "off"): Promise<string> => {
    const root = join(workspace, "store");
    await cp(join(ROOT, "sandbox"), root, { recursive: true });
    const config = Bun.file(join(root, "trove.yaml"));
    await Bun.write(config, (await config.text()).replace("sync: off", `sync: ${mode}`));
    return root;
  };

  const breakRisks = async (root: string): Promise<void> => {
    const risks = join(root, "RISKS.md");
    await Bun.write(
      risks,
      (await Bun.file(risks).text()).replace("status: current", "status: done"),
    );
  };

  const spawnHook = async (name: string, input: unknown) => {
    const child = Bun.spawn(["bun", join(ROOT, "src", "cli", "main.ts"), "hook", name], {
      stdin: new Blob([typeof input === "string" ? input : JSON.stringify(input)]),
      stderr: "pipe",
    });
    return { code: await child.exited, err: await new Response(child.stderr).text() };
  };

  test("a relative path is resolved against cwd", async () => {
    const root = await store();
    await breakRisks(root);
    const reply = await afterEdit({ cwd: root, tool_input: { path: "RISKS.md" } });
    expect(reply.code).toBe(2);
    expect(reply.message).toContain("RISKS.md:3 known-status");
  });

  test("an absolute path and a file outside any store still work", async () => {
    const root = await store();
    await breakRisks(root);
    expect((await afterEdit({ tool_input: { path: join(root, "RISKS.md") } })).code).toBe(2);
    expect(await afterEdit({ cwd: workspace, tool_input: { path: "notes.md" } })).toEqual({
      code: 0,
      message: "",
    });
  });

  test("stop never answers 2, whatever goes wrong", async () => {
    const root = await store("commit");
    await git(root, ["init", "--quiet"]);
    await Bun.write(join(root, "plans", "PLAN_BROKEN.md"), "no header\n");
    expect((await atStop({ cwd: root })).code).toBe(1);

    await Bun.write(join(root, "trove.yaml"), "sync: [not valid\n");
    expect((await spawnHook("stop", { cwd: root })).code).toBe(1);
    expect((await spawnHook("stop", "{ not json")).code).toBe(1);
  });
});
