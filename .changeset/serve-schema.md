---
"trove": minor
---

`trove schema` prints the JSON Schema of `trove.yaml`, generated from the config schema and committed as `schema/config.schema.json`; `init` and `migrate` start new configs with a `yaml-language-server` line pointing at it. `trove serve [--port N]` opens a read-only dashboard on 127.0.0.1: documents and items with `query` filters, a document's text, live summaries.
