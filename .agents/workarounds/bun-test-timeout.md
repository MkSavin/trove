---
anchor: WORKAROUND:bun-test-timeout
rule: Run the whole suite through `bun run test`, which passes --timeout on the command line.
code: none
why: The fix is a flag in package.json, which has no comment to carry an anchor.
---

**Symptom.** In a full run, git-heavy tests late in the list fail with `timed out after 5000ms` on a loaded machine, although `bunfig.toml` says 30000.

**Mechanics.** In Bun 1.4 both bunfig's `timeout` and a preloaded `setDefaultTimeout` reach only the first test file. Every later file gets the 5 second default. A probe of three files that each sleep 6 seconds passes the first and fails the other two.

**Fix.** `bun test --timeout 30000` applies to every file; `verify`, the pre-commit hook and CI all go through the `test` script. `bunfig.toml` keeps its value for a single-file `bun test <file>`.

Not checked automatically: it shows only when a test outruns 5 seconds.
