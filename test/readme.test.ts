import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { builtinRules, parseConfig } from "../src/index.ts";
import { ROOT } from "./helpers.ts";

for (const name of ["README.md", "README.ru.md"]) {
  describe(name, () => {
    const read = () => Bun.file(join(ROOT, name)).text();

    test("lists every built-in rule with its default level", async () => {
      const readme = await read();
      for (const rule of builtinRules) {
        expect(readme).toContain(`| \`${rule.id}\` | ${rule.level} |`);
      }
    });

    test("its config example is a valid config", async () => {
      const example = /```yaml\n([\s\S]*?)```/.exec(await read())?.[1];
      expect(example).toBeDefined();
      expect(() => parseConfig(example ?? "", name)).not.toThrow();
    });
  });
}
