import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPluginRules, mergeRules } from "../src/core/rules/plugins.ts";
import { builtinRules, defineRule } from "../src/index.ts";
import { ROOT } from "./helpers.ts";

const API = pathToFileURL(join(ROOT, "src", "index.ts")).href;

const withPlugins = async (
  files: Record<string, string>,
  body: (root: string) => Promise<void>,
) => {
  const root = await mkdtemp(join(tmpdir(), "trove-plugins-"));
  try {
    await Promise.all(
      Object.entries(files).map(([name, text]) => Bun.write(join(root, "plugins", name), text)),
    );
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
};

describe("plugins", () => {
  test("load rules exported from every script in the folder", () =>
    withPlugins(
      {
        "no-todo.ts": `import { defineRule } from "${API}";
export const rules = [defineRule({ id: "no-todo", level: "warn", summary: "x", scope: "document", check: () => [] })];`,
      },
      async (root) => {
        const rules = await loadPluginRules(root, "plugins");
        expect(rules.map((rule) => rule.id)).toEqual(["no-todo"]);
      },
    ));

  test("reject a module without a rules array", () =>
    withPlugins({ "bad.ts": "export const rule = 1;" }, async (root) => {
      await expect(loadPluginRules(root, "plugins")).rejects.toThrow(/must export rules/);
    }));

  test("reject a missing folder and ids that clash with built-ins", async () => {
    await expect(loadPluginRules(tmpdir(), "no-such-plugins")).rejects.toThrow(/does not exist/);
    const clash = defineRule({
      id: "stale",
      level: "info",
      summary: "",
      scope: "store",
      check: () => [],
    });
    expect(() => mergeRules(builtinRules, [clash])).toThrow(/clashes/);
  });
});
