---
anchor: WORKAROUND:compiled-bun-be-bun
rule: Set BUN_BE_BUN=1 when a process re-runs itself as Bun.
---

**Symptom.** In a release binary, `check --verify` runs trove's own CLI instead of the document's command, which fails on an unknown command `exec`.

**Mechanics.** A compiled executable's `process.execPath` is the executable itself, and it runs its embedded program. Bun has an environment switch that makes it behave as the plain `bun` runtime instead.

**Fix.** `runShell` starts `process.execPath exec <command>` with `BUN_BE_BUN=1`. From source the variable changes nothing.

Not checked automatically: tests run from source, and only release builds are compiled.
