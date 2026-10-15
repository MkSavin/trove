---
type: audit
status: открыт
date: 2026-10-01
checked: 2026-10-01
scope: "frontend"
slug: BRK1
---

# AUDIT_BROKEN_1 — a broken ledger

**Статус документа:** закрыт. Строка статуса врёт. Сверено 2026-09-30.

<!-- ledger -->
| id | P | модуль | владелец | статус | что осталось |
| -- | - | ------ | -------- | ------ | ------------ |
| BRK1-1 | P1 | вход | frontend | открыто | A pipe | inside a cell |
| BRK1‑2 | P2 | вход | frontend | открыто | Non-breaking hyphen in the id |
| XX-3 | P2 | вход | frontend | открыто | Foreign prefix |
| BRK1-4 | P3 | вход | frontend | сделано | Status outside the vocabulary |
<!-- /ledger -->
