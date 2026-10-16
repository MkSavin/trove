---
"trove": minor
---

Plan stages: a type with the new `stages` capability (plans in both presets) reads its first task list or table with a status column as stages, exposed as the fields `progress` (`3/5`), `next` and `bar` (`3/5 ▰▰▰▱▱`) for filters, columns and reports, and listed by a `<!-- trove:progress … -->` block. The status column names and done values are set by `stages:` in the config, with English and Russian defaults. Existing stores add `stages` to their plan type's capabilities.
