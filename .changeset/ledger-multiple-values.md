---
"trove": minor
---

A ledger cell of `—`, `–` or `-` reads as empty everywhere: `item-enum` skips it, filters match it as an empty field and groups put it under no value. A ledger column with `multiple: true` takes comma-separated values: `item-enum` checks each, filters match any of them, and counts, trend and report groups count the item under each value.
