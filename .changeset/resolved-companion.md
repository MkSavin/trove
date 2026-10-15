---
"trove": minor
---

The audit addendum is now the `resolved` type (`AUDIT_X.RESOLVED.md`, capability `resolved-of`): with `closeInto`, `item close --as <outcome>` moves the row into its closed-items ledger of the same columns and the section below it, creating the companion on first use and archiving it with the audit. `ledger.closed` is a map of outcomes and `ledger.note` marks the heading; `show` finds closed items and, without a ledger row, every section titled by the id; closed items stay out of queries unless a filter names `state`.
