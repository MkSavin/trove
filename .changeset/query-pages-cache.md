---
"trove": minor
---

`trove query` takes `--limit`, `--offset` and `--brief`, and `trove_query` takes `limit` (100 by default), `offset` and `brief`; a cut list ends with a note saying how to read on. The MCP server keeps the parsed store between calls, drift caches its git reads by commit in the store's git folder, and opening a store by path no longer asks git for the project.
