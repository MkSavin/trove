---
"trove": minor
---

A `verify-cmd` header field holds a shell command, with `{root:<name>}` and `{store}` paths, that exits 0 while what the document says still holds. `trove check --verify` runs those of the documents in work in parallel, with `--jobs` and `--timeout`, and exits 1 when one fails; the last result per document is kept in `.trove/cache/` and shown by the `verified` column of `documents` blocks and queries.
