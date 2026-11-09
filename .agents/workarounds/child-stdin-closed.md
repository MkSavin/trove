---
anchor: WORKAROUND:child-stdin-closed
rule: Start every child process with stdin closed.
---

**Symptom.** `trove mcp` over stdio stops answering, and its test hangs until the timeout.

**Mechanics.** A stdio MCP server reads the protocol from its own stdin. A child that inherits it can take bytes meant for the server, or wait on it forever: a git alias, hook or credential helper is enough. Bun 1.4 happens to close stdin by default; with `stdin: "inherit"` the hang returns.

**Fix.** `stdin: "ignore"` stated on every spawn: `git`, `gitSync`, `runShell` and the `ssh -G` lookup. Stated even where it matches the default, so it does not depend on one.

Checked: INV:git/closed-stdin, INV:mcp/stdio-server, INV:verify/closed-stdin.
