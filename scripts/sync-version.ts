#!/usr/bin/env bun
// Copies package.json's version into the Claude Code plugin manifest; run after `changeset version`.
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const manifest = Bun.file(join(import.meta.dir, "..", "plugin", ".claude-plugin", "plugin.json"));
const plugin = await manifest.json();
await Bun.write(
  manifest,
  `${JSON.stringify({ ...plugin, version: packageJson.version }, null, 2)}\n`,
);
