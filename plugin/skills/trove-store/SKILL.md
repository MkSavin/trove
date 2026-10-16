---
name: trove-store
description: Work in a trove store of audits, plans, specs, research and prompts kept as Markdown. Use when the user asks to read, find, write, close or archive findings, ledger items, plans or specs, or mentions trove, BACKLOG.md or a document like AUDIT_*, PLAN_*, SPEC_*.
---

# Working in a trove store

A store is a git repository of Markdown documents for one project. Its rules live in `trove.yaml`; trove checks them and edits documents without breaking them. Prefer the `trove_*` MCP tools; the same operations exist as `trove` commands.

## Before anything

- Read how this store works: `trove_regulation` with `topic: workflow`, then `types` or `ledger` when you need them (`trove regulation workflow`).
- Several stores in one project: pass `store` (CLI: `--store <name>`).

## Read slices, not files

- Find items: `trove_query` `{kind: "items", filters: {status: "open", owner: "web"}}` (`trove query items status=open owner=web`). `drift: "true"` lists items whose row or section points at code (or the named lines) that changed after their document's `checked` date: re-check those first; `"unknown"` means it could not be checked.
- Find documents: `trove_query` `{kind: "documents", filters: {type: "plan", place: "work"}}`; `stale: "true"` lists what needs re-checking, and `fields: ["path", "progress", "next"]` shows how far each plan is.
- Read one finding: `trove_show` `{ref: "WEB1-4"}`; one section: `AUDIT_WEB_1#Ledger`; an outline: the document name.
- Status of an area: `trove_summary` with a configured `kind` and/or filters, e.g. `{filters: {owner: "web", path: "!audits/mobile/**"}}`. Filters take `~substring`, globs and `!` to exclude, everywhere.
- Never open `BACKLOG.md` or a whole audit to find one item.

## Write through trove

- New document: `trove_create` with `type`, `topic` and required fields such as `scope`. Name, folder, series number and slug are chosen for you.
- New finding: `trove_item` `{action: "add", document, values: {priority, owner, what, module?}}`, then write its section body under the heading trove added.
- Fixed: `trove_item` `{action: "close", id, commit}`; add `archive: true` when trove says it was the last open item.
- Re-checked against the code: `trove_update` `{document, field: "checked"}`; status changes go through `field: "status"`.
- Repeatable re-check: `trove_update` `{document, field: "verify-cmd", value}`, a shell command that exits 0 while what the document describes still holds, e.g. `git -C {root:app} grep -q presence.v2 -- api/hub.go`. The user runs them with `trove check --verify`.
- Finished plan or spec: `trove_transition` `{document, to: "archive"}`.
- Wrong type, such as research that turned into a plan of work: `trove_transition` `{document, to: "type", type: "plan"}`. Which type fits: `trove_regulation` `placement`.
- New summary: `trove_create` `{kind, topic}` (`trove summary new <kind>`). Its `<!-- trove:… -->` blocks are generated; write up every `<!-- write: … -->` place from what the blocks show and the documents they link, under its marker line: keep the line, the next summary carries the text over by it.
- Never edit inside `<!-- trove:… -->` blocks: change the documents they come from, or the block's options.
- Use `dryRun: true` when unsure; read the diff before writing.
- A refused edit lists the errors it would add. Fix the cause; do not hand-edit around it.

## Writing a finding

One finding, one section:

1. Heading `### <id>. <what breaks, in one line> (<status>)`.
2. A paragraph in plain words: what the user sees and when.
3. Where in the code, as relative links to files and lines.
4. The fix, short. No history, no essays.

Keep ledger cells free of `|` and ids in ASCII. Do not edit generated files such as `BACKLOG.md` or `prompts/README.md`.

## After hand edits

Run `trove_check`; when it is clean, `trove_sync` commits the edits with rebuilt reports (the store's `sync` mode decides whether it also pushes). Never commit or push the store with git yourself.
