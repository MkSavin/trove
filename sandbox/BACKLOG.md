---
type: backlog
status: current
date: 2026-10-15
checked: 2026-10-15
scope: all audits
---

# BACKLOG — what is left across all audits

**Status:** current. Generated from the audit ledgers; do not edit by hand. Checked 2026-10-15.

Rebuild with `trove report backlog`. To close an item, remove its row from the ledger of the audit that owns it and rebuild.

## web

| id | P | module | status | what is left | audit |
| -- | - | ------ | ------ | ------------ | ----- |
| WEB1-1 | P1 | composer | open | A message sent while offline is dropped silently: no retry, no "not sent" mark | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |
| WEB1-2 | P1 | threads | open | Opening a long thread blocks the main thread for ~800 ms on mid-range laptops | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |
| WEB1-3 | P2 | threads | open | Unread counter drifts after a reconnect: deltas are applied twice | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |
| WEB1-4 | P2 | notifications | open | Desktop notifications fire for the thread the user is reading | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |
| WEB1-7 | P2 | composer | open | Pasting a large image freezes the composer while it is encoded | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |
| WEB1-5 | P3 | settings | deferred | Notification sound picker ignores the OS "do not disturb"; waits for the new settings page | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |
| WEB1-8 | P3 | a11y | open | Thread list items have no accessible name; screen readers say "button" | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |

## api

| id | P | module | status | what is left | audit |
| -- | - | ------ | ------ | ------------ | ----- |
| API2-1 | P0 | — | open | A refresh token stays valid after logout on another device | [AUDIT_API_2](audits/AUDIT_API_2.md) |
| API2-2 | P1 | — | open | Attachment upload accepts any content type and serves it inline | [AUDIT_API_2](audits/AUDIT_API_2.md) |
| API2-3 | P2 | — | open | The rate limiter keys by IP only: a whole office shares one bucket | [AUDIT_API_2](audits/AUDIT_API_2.md) |

## mobile

| id | P | module | status | what is left | audit |
| -- | - | ------ | ------ | ------------ | ----- |
| MOB1-1 | P1 | push | open | The iOS badge is not reset after reading on the web | [AUDIT_MOBILE_1](audits/mobile/AUDIT_MOBILE_1.md) |
| MOB1-2 | P2 | background | open | Android kills the sync service on some vendors' phones; messages arrive only on open | [AUDIT_MOBILE_1](audits/mobile/AUDIT_MOBILE_1.md) |
| MOB1-3 | P3 | push | deferred | Rich push previews, after the notification rule (WEB1-6) | [AUDIT_MOBILE_1](audits/mobile/AUDIT_MOBILE_1.md) |

## infra

| id | P | module | status | what is left | audit |
| -- | - | ------ | ------ | ------------ | ----- |
| API2-4 | P2 | — | open | Database backups are not restore-tested; the last good restore is unknown | [AUDIT_API_2](audits/AUDIT_API_2.md) |

## product

| id | P | module | status | what is left | audit |
| -- | - | ------ | ------ | ------------ | ----- |
| WEB1-6 | P2 | notifications | open | No agreed rule for which mentions notify on mobile and web at the same time | [AUDIT_WEB_1](audits/AUDIT_WEB_1.md) |

## Specs and plans not finished yet

| document | status | how to verify |
| -------- | ------ | ------------- |
| [PLAN_OFFLINE_MODE](plans/PLAN_OFFLINE_MODE.md) | not started | stage 1 starts with the outbox in `web/src/composer/send.ts` (WEB1-1) |
| [PLAN_PUSH_RETRY](plans/PLAN_PUSH_RETRY.md) | in progress | retry queue `push.retry` in `infra/queues.tf`; backoff in `api/push/sender.go` |
| [SPEC_PRESENCE](specs/SPEC_PRESENCE.md) | in progress | stage 2: `presence.v2` topic exists in `api/presence/hub.go` |
| [SPEC_SEARCH_V2](specs/SPEC_SEARCH_V2.md) | not started | nothing in code yet; start from `api/search/index.go` |
