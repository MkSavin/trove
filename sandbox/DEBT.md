---
type: debt
status: current
date: 2026-09-30
checked: 2026-10-12
scope: "api/, infra/, mobile/"
verify: walk "How to re-check" of every item
---

# DEBT — promised in plans, not done on the server, mobile and infra

**Status:** current. 2 items for the server, 1 for infra. Checked 2026-10-12.

What our plans promised from the other sides and the code does not have yet. Web debt lives in the audit ledgers and in `BACKLOG.md`.

## Server

<!-- ledger -->
| id | status | what was promised | plan |
| -- | ------ | ----------------- | ---- |
| DEBT-S1 | open | Presence fan-out per team | [SPEC_PRESENCE](specs/SPEC_PRESENCE.md) stage 2 |
| DEBT-S2 | open | Search index in its own service | [SPEC_SEARCH_V2](specs/SPEC_SEARCH_V2.md) |
<!-- /ledger -->

### DEBT-S1. Presence fan-out per team (open)

The presence spec promised one fan-out per team instead of one per member. The server still sends a presence event to every member separately.

**How to re-check.** `api/presence/fanout.go`: one publish per team id.

### DEBT-S2. Search index in its own service (open)

Search v2 moves the index out of the API process. It still lives in the API.

**How to re-check.** `api/search/` holds no index code.

## Infra

<!-- ledger -->
| id | status | what was promised | plan |
| -- | ------ | ----------------- | ---- |
| DEBT-I1 | open | Push delivery dashboard | [PLAN_PUSH_RETRY](plans/PLAN_PUSH_RETRY.md) stage 3 |
<!-- /ledger -->

### DEBT-I1. Push delivery dashboard (open)

The push retry plan promised a dashboard of delivered, retried and dropped pushes. Nothing is exported yet.

**How to re-check.** `infra/dashboards/` has a push panel.
