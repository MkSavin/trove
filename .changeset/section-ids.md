---
"trove": minor
---

Ledgers with several tables: `{section}` in `ledger.id` with `ledger.sections` gives every table its own id code (`DEBT-S3`, `DEBT-I2`); `item add … section=<heading>` and `item move --section` pick the table, and new item sections land after that table's last one instead of the end of the file.
