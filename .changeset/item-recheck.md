---
"trove": minor
---

`trove item recheck <id...>` (also `--drifted`, filters, `--unchanged` for code changed in whitespace alone, and `trove_item` action `recheck`) writes the commit an item's code is at into its own `checked` column, and drift counts from there. Drift tells `drift=file` apart: a file whose named lines are unchanged but whose other lines changed. A new `stale-check` rule, off by default, flags open items not re-checked within `limit` days or before `commits` commits touched their code.
