---
anchor: WORKAROUND:claude-project-key
rule: Key projects in Claude Code's user config with forward slashes.
---

**Symptom.** After `trove client add claude --local` on Windows, Claude Code does not see the server.

**Mechanics.** Claude Code stores a project under its root with forward slashes, also on Windows, where native paths use backslashes.

**Fix.** `projectKey` passes the root through `toPosix`.

Checked: INV:clients/forward-keys.
