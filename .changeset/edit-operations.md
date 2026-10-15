---
"trove": minor
---

Edit operations: `doc new|archive|checked|set` and `item add|close|defer`. Each patches only its own lines (CRLF kept), is checked in memory before writing, refuses changes that add errors, and rebuilds generated reports in the same step. `--dry-run` prints the line diff.
