---
type: deferred
status: current
date: 2026-10-08
checked: 2026-10-12
scope: "web/, api/"
verify: walk "Come back when" of every item
---

# DEFERRED — our own work put off on purpose

**Status:** current. 3 items. Checked 2026-10-12.

What we chose not to do yet: why, where it came from and what brings it back. What other teams still owe us is in [DEBT](DEBT.md).

## Ledger

<!-- ledger -->
| id | P | owner | status | what | from | why | until |
| -- | - | ----- | ------ | ---- | ---- | --- | ----- |
| DEF-1 | P3 | web | deferred | Drafts follow the user across devices | [PLAN_OFFLINE_MODE](plans/PLAN_OFFLINE_MODE.md) stage 2 | Drafts kept on one device answer most requests | PLAN_OFFLINE_MODE |
| DEF-2 | P2 | api | deferred | Search results ranked by recency and author | [SPEC_SEARCH_V2](specs/SPEC_SEARCH_V2.md) | Ranking belongs in the new index service | DEBT-S2 |
| DEF-3 | P3 | web | deferred | Custom colour themes for a team | product review | Few teams asked; the light and dark themes cover the rest | 2027-03-01 |
<!-- /ledger -->

### DEF-1. Drafts follow the user across devices (deferred)

A draft typed on the laptop does not show up on the phone. The offline plan keeps drafts on the device that wrote them.

**Come back when.** The offline plan is done: its outbox is the place to sync drafts from.

### DEF-2. Search results ranked by recency and author (deferred)

Search returns matches in index order. Ranking them in the API process would be thrown away once the index moves out.

**Come back when.** DEBT-S2 moves the index into its own service.

### DEF-3. Custom colour themes for a team (deferred)

Team admins cannot pick brand colours. Two teams asked; the built-in themes are enough for everyone else.

**Come back when.** The next product review, in March.
