---
"trove": minor
---

`changes` moves a start from before the store existed to its first commit with a note line, counts archived documents' items as closed and says `no changes` when empty. `trend` marks the week the store came in as `at start`, counts moves in their own `moved` column, groups items without the `by` field by their document's field or `fallback=<field|section>`, and filters `path` by where the item was that week.
