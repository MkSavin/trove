---
"trove": minor
---

A `deferred` type in the presets: `DEFERRED.md` holds the team's own work put off on purpose, with `DEF-n` ids and `from`, `why` and `until` columns. `trove item defer <id> --to DEFERRED why=… until=…` (MCP: `to`) moves an item there and leaves a `moved` record behind; `until` also takes a date, and `deferral-lifted` fires once it has come.
