import { describe, expect, test } from "bun:test";
import { LANGUAGES, presetConfig } from "../src/core/presets/presets.ts";
import { parseConfig } from "../src/index.ts";

const MINIMAL = `
regulation: 1
statuses: { open: open, archived: archived }
types: { note: { capabilities: [status-line] } }
`;

describe("config", () => {
  test.each(LANGUAGES)("the %s preset is valid", (language) => {
    const config = parseConfig(presetConfig(language), language);
    expect(config.types.audit?.capabilities).toContain("ledger");
    expect(Object.keys(config.ledger?.columns.find((c) => c.key === "status")?.enum ?? {})).toEqual(
      ["open", "deferred"],
    );
  });

  test("fills defaults", () => {
    const config = parseConfig(MINIMAL, "inline");
    expect(config.archive).toEqual({ folder: ".archive", status: "archived", finished: [] });
    expect(config.freshness.default).toBe(60);
    expect(config.rules).toEqual({});
  });

  test("normalizes shorthand field specs and rule levels", () => {
    const config = parseConfig(
      `${MINIMAL}fields: { slug: required }\nrules: { stale: off, unknown-field: { level: error, since: 2026-09-01 } }`,
      "inline",
    );
    expect(config.fields.slug).toEqual({ required: true, format: "text" });
    expect(config.rules.stale).toEqual({ level: "off", since: undefined });
    expect(config.rules["unknown-field"]?.since).toBe("2026-09-01");
  });

  test("rejects unknown keys and broken cross-references", () => {
    expect(() => parseConfig(`${MINIMAL}colour: red`, "inline")).toThrow(/colour/);
    expect(() =>
      parseConfig(`${MINIMAL}folders: { notes: { prefix: NOTE_, types: [memo] } }`, "inline"),
    ).toThrow(/folders.notes.types: unknown memo/);
    expect(() => parseConfig(MINIMAL.replace("[status-line]", "[ledger]"), "inline")).toThrow(
      /needs a ledger section/,
    );
  });

  test("reports YAML syntax errors with the origin", () => {
    expect(() => parseConfig("regulation: [1", "store/trove.yaml")).toThrow(/store\/trove.yaml/);
  });
});
