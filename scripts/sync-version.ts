#!/usr/bin/env bun
// Copies package.json's version into the assistant plugin manifests; run after `changeset version`.
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const root = join(import.meta.dir, "..");
const manifests = [
  join(root, "plugin", ".claude-plugin", "plugin.json"),
  join(root, "kimi.plugin.json"),
];
for (const path of manifests) {
  const manifest = Bun.file(path);
  const plugin = await manifest.json();
  await Bun.write(
    manifest,
    `${JSON.stringify({ ...plugin, version: packageJson.version }, null, 2)}\n`,
  );
}
