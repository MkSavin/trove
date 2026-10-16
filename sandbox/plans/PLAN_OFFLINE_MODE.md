---
type: plan
status: not started
date: 2026-10-06
checked: 2026-10-06
scope: "web/src/composer, web/src/sync, mobile/"
verify: stage 1 starts with the outbox in `web/src/composer/send.ts` (WEB1-1)
---

# PLAN_OFFLINE_MODE — reading and writing without a connection

**Status:** not started. Waits for WEB1-1 to land the outbox. Checked 2026-10-06.

## Stages

| stage | what | done when | status |
| ----- | ---- | --------- | ------ |
| 1 | outbox with retries and a "not sent" mark | no message is lost across a reconnect | not started |
| 2 | last 50 threads cached for reading | threads open in airplane mode | not started |
| 3 | settings page reads cached prefs | settings open offline; closes WEB1-5 | not started |

## Risks

- Cache size on low-end phones: cap at 20 MB, oldest threads go first.
- Conflicts when the same draft is edited on two devices: last write wins, the other copy is kept as a draft.
