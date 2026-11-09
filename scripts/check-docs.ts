#!/usr/bin/env bun
// Fails when the docs drift from the code; `--write` regenerates the workarounds index first.
import { join } from "node:path";
import { findAnchors } from "./docs/anchors.ts";
import { checkDocs } from "./docs/check.ts";
import { readRepo, WORKAROUNDS_INDEX } from "./docs/repo.ts";
import { renderWorkaroundIndex } from "./docs/workarounds.ts";

const ROOT = join(import.meta.dir, "..");

if (Bun.argv.includes("--write")) {
  const repo = await readRepo(ROOT);
  const { anchors } = findAnchors(repo.code);
  await Bun.write(join(ROOT, WORKAROUNDS_INDEX), renderWorkaroundIndex(repo, anchors));
}

const problems = checkDocs(await readRepo(ROOT));
if (problems.length > 0) {
  console.error(`check-docs: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("check-docs ✔");
