#!/usr/bin/env bun
// Single-file executables for every platform: `bun scripts/build.ts [target...]`.
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ENTRY = join(ROOT, "src", "cli", "main.ts");
const OUT = join(ROOT, "dist");

const TARGETS = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-windows-x64",
] as const;

const outfile = (target: string): string => {
  const name = `trove-${target.replace(/^bun-/, "")}`;
  return join(OUT, target.includes("windows") ? `${name}.exe` : name);
};

const wanted = Bun.argv.slice(2);
const targets = wanted.length > 0 ? TARGETS.filter((target) => wanted.includes(target)) : TARGETS;

for (const target of targets) {
  await Bun.$`bun build ${ENTRY} --compile --minify --target=${target} --outfile=${outfile(target)}`.cwd(
    ROOT,
  );
  console.log(`built ${outfile(target)}`);
}
