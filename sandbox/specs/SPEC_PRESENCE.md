---
type: spec
status: in progress
date: 2026-09-20
checked: 2026-10-08
scope: "api/presence, web/src/presence, mobile/"
verify: stage 2: `presence.v2` topic exists in `api/presence/hub.go`
verify-cmd: git -C {root:harbor} grep -q presence.v2 -- api/presence/hub.go
---

# SPEC_PRESENCE — who is online, without polling

**Status:** in progress. Stage 1 shipped; stage 2 (server fan-out) in review. Checked 2026-10-08.

## Goal

Clients learn presence changes from a push topic instead of polling `/users/online` every 30 s.

## Stages

1. **Client subscribes to `presence.v2`.** Done in web and mobile behind a flag.
2. **Server fans out changes per team.** In review.
3. **Polling endpoint removed.** After a week with the flag on for everyone.

## Contract

| field | type | meaning |
| ----- | ---- | ------- |
| `userId` | string | who changed |
| `state` | `online` \| `away` \| `offline` | new state |
| `at` | RFC 3339 | server time of the change |
