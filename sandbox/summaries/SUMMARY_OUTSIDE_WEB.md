---
type: summary
status: current
date: 2026-10-15
checked: 2026-10-15
scope: all audits except AUDIT_WEB_1
kind: outside-web
filter: path=!audits/AUDIT_WEB_1.md
---

# Everything but the web audit (2026-10-15)

**Status:** current. Checked 2026-10-15.

Everything open outside the web audit: the API and mobile ledgers and DEBT.md, with the specs, plans and studies still in work. Checked against the ledgers as of the date above; the web client has its own summary, [SUMMARY_WEB](SUMMARY_WEB.md).

Look first at API2-1: a refresh token that survives logout elsewhere is the one P0 in the store. MOB1-2 is next: messages that arrive only on open look like lost messages to users.

## By priority

<!-- trove:counts by=priority -->
| P | count |
| - | ----- |
| — | 3 |
| P0 | 1 |
| P1 | 2 |
| P2 | 3 |
| P3 | 1 |
<!-- /trove:counts -->

## Open items

<!-- trove:items group=document -->
**[DEBT](../DEBT.md)**

| id | P | what is left |
| -- | - | ------------ |
| DEBT-I1 | — | Push delivery dashboard |
| DEBT-S1 | — | Presence fan-out per team |
| DEBT-S2 | — | Search index in its own service |

**[AUDIT_API_2](../audits/AUDIT_API_2.md)**

| id | P | what is left |
| -- | - | ------------ |
| API2-1 | P0 | A refresh token stays valid after logout on another device |
| API2-2 | P1 | Attachment upload accepts any content type and serves it inline |
| API2-3 | P2 | The rate limiter keys by IP only: a whole office shares one bucket |
| API2-4 | P2 | Database backups are not restore-tested; the last good restore is unknown |

**[AUDIT_MOBILE_1](../audits/mobile/AUDIT_MOBILE_1.md)**

| id | P | what is left |
| -- | - | ------------ |
| MOB1-1 | P1 | The iOS badge is not reset after reading on the web |
| MOB1-2 | P2 | Android kills the sync service on some vendors' phones; messages arrive only on open |
| MOB1-3 | P3 | Rich push previews, after the notification rule (WEB1-6) |
<!-- /trove:items -->

## Documents in work

<!-- trove:documents place=work type=spec,plan,study as=list format="{document} — {status}" -->
- [PLAN_OFFLINE_MODE](../plans/PLAN_OFFLINE_MODE.md) — not started
- [PLAN_PUSH_RETRY](../plans/PLAN_PUSH_RETRY.md) — in progress
- [SPEC_PRESENCE](../specs/SPEC_PRESENCE.md) — in progress
- [SPEC_SEARCH_V2](../specs/SPEC_SEARCH_V2.md) — not started
- [STUDY_RECONNECT_STORMS](../research/STUDY_RECONNECT_STORMS.md) — in progress
<!-- /trove:documents -->

Not verified yet: whether [STUDY_RECONNECT_STORMS](../research/STUDY_RECONNECT_STORMS.md) explains MOB1-2 as well, and whether a backup has ever been restored (API2-4).
