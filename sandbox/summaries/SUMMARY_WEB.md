---
type: summary
status: current
date: 2026-10-15
checked: 2026-10-15
scope: web client
kind: web
---

# Web client — what is left (2026-10-15)

**Status:** current. Checked 2026-10-15.

First summary for the web team: seven open items in one audit, two of them P1, and three specs and plans that touch web/.

## By priority

<!-- trove:counts owner=web by=priority -->
| P | count |
| - | ----- |
| P1 | 2 |
| P2 | 3 |
| P3 | 4 |
<!-- /trove:counts -->

## Open items

<!-- trove:items owner=web group=document columns=id,priority,module,what -->
**[DEFERRED](../DEFERRED.md)**

| id | P | module | what is left |
| -- | - | ------ | ------------ |
| DEF-1 | P3 | — | Drafts follow the user across devices |
| DEF-3 | P3 | — | Custom colour themes for a team |

**[AUDIT_WEB_1](../audits/AUDIT_WEB_1.md)**

| id | P | module | what is left |
| -- | - | ------ | ------------ |
| WEB1-1 | P1 | composer | A message sent while offline is dropped silently: no retry, no "not sent" mark |
| WEB1-2 | P1 | threads | Opening a long thread blocks the main thread for ~800 ms on mid-range laptops |
| WEB1-3 | P2 | threads | Unread counter drifts after a reconnect: deltas are applied twice |
| WEB1-4 | P2 | notifications | Desktop notifications fire for the thread the user is reading |
| WEB1-7 | P2 | composer | Pasting a large image freezes the composer while it is encoded |
| WEB1-5 | P3 | settings | Notification sound picker ignores the OS "do not disturb"; waits for the new settings page |
| WEB1-8 | P3 | a11y | Thread list items have no accessible name; screen readers say "button" |
<!-- /trove:items -->

## Specs and plans that touch web/

<!-- trove:documents type=spec,plan scope=~web place=work as=list format="{document} — {status}" -->
- [PLAN_OFFLINE_MODE](../plans/PLAN_OFFLINE_MODE.md) — not started
- [SPEC_PRESENCE](../specs/SPEC_PRESENCE.md) — in progress
- [SPEC_SEARCH_V2](../specs/SPEC_SEARCH_V2.md) — not started
<!-- /trove:documents -->

Look first at WEB1-1: a dropped message is the worst kind of silent failure. WEB1-2 is measured on one laptop model only, so its ~800 ms is not verified on others.
