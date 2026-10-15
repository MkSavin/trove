---
type: audit
status: open
date: 2026-09-15
checked: 2026-10-01
scope: "mobile/ (iOS and Android shells, push)"
slug: MOB1
verify: MOB1-1 badge reset in `mobile/ios/Harbor/AppDelegate.swift`
---

# AUDIT_MOBILE_1 — mobile apps: push and background work

**Status:** open. 2 open, 1 deferred. Checked 2026-10-01.

## Ledger

<!-- ledger -->
| id | P | module | owner | status | what is left |
| -- | - | ------ | ----- | ------ | ------------ |
| MOB1-1 | P1 | push | mobile | open | The iOS badge is not reset after reading on the web |
| MOB1-2 | P2 | background | mobile | open | Android kills the sync service on some vendors' phones; messages arrive only on open |
| MOB1-3 | P3 | push | mobile | deferred | Rich push previews, after the notification rule (WEB1-6) |
<!-- /ledger -->

## MOB1-1. The badge is not reset after reading on the web (open)

The server sends no silent push on read; the badge is computed only when the app starts.

## MOB1-2. The sync service is killed in the background (open)

Needs a foreground service or high-priority FCM for new messages.

## MOB1-3. Rich push previews (deferred)

Blocked by WEB1-6.
