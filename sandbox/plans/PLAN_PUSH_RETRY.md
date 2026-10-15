---
type: plan
status: in progress
date: 2026-09-25
checked: 2026-10-11
scope: "api/push, infra/queues"
verify: retry queue `push.retry` in `infra/queues.tf`; backoff in `api/push/sender.go`
---

# PLAN_PUSH_RETRY — retries for failed push notifications

**Status:** in progress. Stage 1 merged, stage 2 in progress. Checked 2026-10-11.

## Stages

1. **Retry queue with exponential backoff.** Merged.
2. **Drop tokens that fail three times in a row.** In progress.
3. **Dashboard of push delivery by platform.** Not started.
