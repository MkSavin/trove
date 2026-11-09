# trove

Plain-Markdown archive of audits, plans and specs: one config, one checker, CLI and MCP on top. Bun 1.4, TypeScript 7, nothing to build for development. Entry points: `src/cli/main.ts`, `src/mcp/server.ts`, `src/index.ts`. Run `ls` for the layout.

| task or symptom | read |
| --- | --- |
| a link in a generated report or summary is broken | `.agents/live-views.md`, `.agents/workarounds/posix-relative-cwd.md` |
| an operation committed something it should not, or nothing | `.agents/sync.md` |
| an edit was refused, or touched other lines | `.agents/operations.md` |
| MCP test hangs, a tool never answers | `.agents/workarounds/child-stdin-closed.md`, `.agents/mcp.md` |
| tests pass alone and fail in the pre-commit hook | `.agents/workarounds/git-hook-variables.md` |
| a rule misfires, adding a rule | `.agents/rules.md` |
| a ledger row or id reads wrong | `.agents/documents.md` |
| the wrong store is found, or none | `.agents/store.md` |
| a generated block is stale, empty or lost its text | `.agents/live-views.md` |
| `drift`, filters or `query` answer oddly | `.agents/query.md` |
| `migrate` or `resync` lost or conflicted something | `.agents/migrate.md` |
| `check --verify` hangs or lies | `.agents/verify.md` |
| an assistant is not connected, a hook stays silent | `.agents/mcp.md` |
| a CLI exit code, the read-only dashboard | `.agents/cli.md` |
| fails on one OS only | `.agents/workarounds.md` |
| how to comment code, known gaps | `.agents/comments.md`, `.agents/todo.md` |

## Never break

1. Nothing about other projects in this public repo: neutral examples only. Not checked automatically: a list of the names would publish them.
2. Never rewrite an archived snapshot: archived documents and past summaries keep their blocks (`.agents/live-views.md`). Checked: INV:live/archive-snapshot, INV:ops/summary-snapshot.
3. Edits go through plans, and a plan that adds an error is refused whole (`.agents/operations.md`). Checked: INV:mcp/refused-edit.
4. Git and other child processes never inherit stdin or git hook variables (`.agents/workarounds.md`). Checked: INV:git/closed-stdin, INV:git/hook-variables.
5. An edit changes only its own lines and keeps CRLF. Checked: INV:ops/keeps-crlf.
6. No commit while check is red, none into a repository the store is only nested in, no force push (`.agents/sync.md`). Checked: INV:sync/red-check, INV:sync/nested-repository.
7. The archive a store migrates from is only read (`.agents/migrate.md`). Checked: INV:migrate/reads-only.

## Commands

`bun run verify` is the one green-before-commit command: lint, types, tests, docs. `bun test test/ops.test.ts` runs one file. `bun run check-docs` checks the docs alone, `bun scripts/check-docs.ts --write` regenerates the workaround index. `bun run e2e` drives the CLI end to end. `bunx biome check --write .` formats. A change users can see adds `.changeset/<name>.md`. Docs change in the same commit as the code.
