---
"trove": minor
---

The project tree stays clean by default: `init`, `store add` and `migrate --project` link the store in `.git/trove.yaml`, `trove clone <store-url>` clones and links a store the same way, a store next to the project whose `roots` name it is found without any link, and `--share` writes the committed `.trove.yaml`. Git runs with stdin closed, so the MCP server over stdio no longer loses input to it.
