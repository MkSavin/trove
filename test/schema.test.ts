import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { run } from "../src/cli/run.ts";
import {
  configJsonSchema,
  configJsonSchemaText,
  SCHEMA_MODELINE,
  withSchemaModeline,
} from "../src/core/config/json-schema.ts";
import { LANGUAGES, presetConfig } from "../src/core/presets/presets.ts";
import { captureIo, ROOT } from "./helpers.ts";
import { validate } from "./json-schema.ts";

const SCHEMA_FILE = join(ROOT, "schema", "config.schema.json");

describe("config JSON Schema", () => {
  test("the committed file is the generated one; bun run schema refreshes it", async () => {
    const committed = (await Bun.file(SCHEMA_FILE).text()).replaceAll("\r\n", "\n");
    expect(committed).toBe(configJsonSchemaText());
  });

  test("trove schema prints it", async () => {
    const io = captureIo();
    expect(await run(["schema"], io)).toBe(0);
    expect(JSON.parse(io.stdout())).toEqual(configJsonSchema());
  });

  for (const language of LANGUAGES) {
    test(`the ${language} preset validates`, () => {
      expect(validate(configJsonSchema(), Bun.YAML.parse(presetConfig(language)))).toEqual([]);
    });
  }

  test("the sandbox and README configs validate", async () => {
    const sandbox = Bun.YAML.parse(await Bun.file(join(ROOT, "sandbox", "trove.yaml")).text());
    expect(validate(configJsonSchema(), sandbox)).toEqual([]);
    const readme = /```yaml\n([\s\S]*?)```/.exec(await Bun.file(join(ROOT, "README.md")).text());
    expect(validate(configJsonSchema(), Bun.YAML.parse(readme?.[1] ?? ""))).toEqual([]);
  });

  test("rejects unknown keys and values", () => {
    const config = Bun.YAML.parse(presetConfig("en")) as Record<string, unknown>;
    expect(validate(configJsonSchema(), { ...config, colour: "red" })).toEqual([
      "$.colour: not allowed",
    ]);
    expect(validate(configJsonSchema(), { ...config, sync: "always" })).toHaveLength(1);
  });

  test("a config gets the modeline once", () => {
    const text = withSchemaModeline("regulation: 1\n");
    expect(text.split("\n")[0]).toBe(SCHEMA_MODELINE);
    expect(withSchemaModeline(text)).toBe(text);
  });
});
