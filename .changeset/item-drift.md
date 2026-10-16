---
"trove": minor
---

Items have a `drift` field: `true` when a code file the item's own section links to changed in its root after the document's `checked` date, at the root's `ref` or else at `HEAD`. It filters queries, blocks and MCP queries (`drift=true`), and a `drift` column in a generated block names the changed files. Git runs only when a query, block or report uses the field, once per code root.
