---
"trove": minor
---

`summary new --from latest` finds each write place by its `<!-- write: … -->` line first, so text survives a block added above it; the line now stays above the written text, and `write-place` only reports places with nothing under them. `trove:changes since=<date>` follows the main line instead of an older commit of a branch merged later, and a new summary that replaces one of the same day starts `since=previous` from that one. `trove:branches active=30d|6w|3m` hides branches with no recent commits. New `trove:trend weeks=N by=<field>` block: items opened, closed and open at the end of each week, from the ledgers' history.
