---
anchor: WORKAROUND:bun-shell-backslash
rule: Paths substituted into a verify command use forward slashes.
---

**Symptom.** On Windows a `verify-cmd` with `{store}` or `{root:name}` fails on a path with its separators gone.

**Mechanics.** Bun's shell reads a backslash as an escape on every OS, including Windows, where native paths are full of them.

**Fix.** `expandCommand` writes every path through `toPosix`. Windows accepts forward slashes.

Checked: INV:verify/forward-slashes.
