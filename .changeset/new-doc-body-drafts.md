---
"trove": minor
---

`trove doc new --body-file PATH|-` and `trove_create` `body` write a new document with its whole text in one checked commit. A document created without text, and a summary with an empty write place, is a draft: written but not committed or pushed until the next `trove sync` or an operation that edits it.
