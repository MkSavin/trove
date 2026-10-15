---
"trove": minor
---

`migrate` fits archives that do not look like the presets: ledger columns from the archive's own tables (per type when they differ), no status line where documents have none, status keys as labels when documents write keys, finished statuses the archive keeps (`archive.finished`), and no empty reports. `ignore` takes path globs; text inside inline code is no longer read as a link.
