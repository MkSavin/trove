---
"trove": minor
---

`trove refs <file|dir|glob> [--lines A-B] [--all]` lists open items and ledger-less documents in work that point at code, found the way drift finds references; MCP `trove_query` does the same with `kind: refs`. A new rule, `duplicate-suspect` (off by default), flags open items that look like one finding written twice: most words of their `what` match, or fewer when both name overlapping lines of one file.
