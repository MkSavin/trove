---
type: research
status: open
date: 2026-10-03
checked: 2026-10-09
scope: "api/storage"
verify: rerun `EXPLAIN ANALYZE` from the appendix on a production snapshot
---

# RESEARCH_DB_INDEXES — which indexes the message tables are missing

**Status:** open. Two candidates measured, one left. Checked 2026-10-09.

## Question

Thread pages take 300–900 ms on large teams. Is it the query plan or the payload?

## Findings so far

- `messages(thread_id, created_at)` is missing; the planner sorts 40k rows per page. Adding it cuts p95 from 870 ms to 60 ms on a snapshot.
- `reactions(message_id)` exists but is not used because of a type mismatch in the join.

## Next

Measure the payload size of a thread page with 200 replies before closing.
