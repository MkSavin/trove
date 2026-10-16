---
type: study
status: in progress
date: 2026-10-09
checked: 2026-10-13
scope: "api/realtime, infra/load-balancer"
verify: "step 2: the reconnect histogram in the API dashboard covers all regions"
---

# STUDY_RECONNECT_STORMS — why clients reconnect in waves after a deploy

**Status:** in progress. Step 2 of 4: collecting reconnect timings from production. Checked 2026-10-13.

## Question

After every API deploy, thousands of clients reconnect within the same second and the first pod falls over. Is it the load balancer draining connections at once, or the clients' fixed retry delay?

## Hypotheses

1. The load balancer closes every connection of a draining pod at the same moment.
2. Clients retry after exactly 1 s, without jitter, so they arrive together.

## Steps

| step | what | done when |
| ---- | ---- | --------- |
| 1 | read the client retry code | delays are known: fixed 1 s, no jitter |
| 2 | histogram of reconnect times after the last three deploys | we see one spike or a spread |
| 3 | deploy with connection draining over 30 s on staging | the spike is gone or not |
| 4 | write the answer up as a research report | RESEARCH_RECONNECT_STORMS exists |

## Found so far

Step 1: [`reconnect.ts`](../../harbor/web/src/realtime/reconnect.ts) waits a fixed second; no jitter anywhere.
