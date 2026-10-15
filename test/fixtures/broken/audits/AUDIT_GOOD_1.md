---
type: audit
status: открыт
date: 2026-10-01
checked: 2026-10-01
scope: "frontend"
slug: GOOD1
addition: AUDIT_GOOD_1.ADDITION.md
verify: GOOD1-1 in `app.ts`
---

# AUDIT_GOOD_1 — a healthy audit

**Статус документа:** открыт. Два открытых пункта, один отложен. Сверено 2026-10-01.

## Реестр открытых пунктов

<!-- ledger -->
### Фронтенд

| id | P | модуль | владелец | статус | что осталось |
| -- | - | ------ | -------- | ------ | ------------ |
| GOOD1-10 | P2 | вход | frontend | открыто | Tenth item sorts after the second |
| GOOD1-2 | P2 | чат | frontend | открыто | Second item |
| GOOD1-1 | P1 | вход | frontend | отложено | First item, deferred |

### Сервер

| id | P | владелец | статус | что осталось |
| -- | - | -------- | ------ | ------------ |
| GOOD1-3 | P0 | backend | открыто | Server item without a module column |
<!-- /ledger -->

## Findings

### GOOD1-1. First item

Body of the first item.

```md
### GOOD1-2. Not a heading: inside a fence
```

### GOOD1-10. Tenth item

Body of the tenth item.

### GOOD1-2. Second item

Body of the second item.
