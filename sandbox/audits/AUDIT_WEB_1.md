---
type: audit
status: open
date: 2026-09-28
checked: 2026-10-10
scope: "web/ (composer, threads, notifications)"
slug: WEB1
addition: AUDIT_WEB_1.ADDITION.md
verify: WEB1-1 retry in `web/src/composer/send.ts`; WEB1-3 `unreadCount` in `web/src/stores/threads.ts`
---

# AUDIT_WEB_1 — web client: sending, threads, notifications

**Status:** open. 7 open, 1 deferred; the second pass on 2026-10-10 added WEB1-7 and WEB1-8. Checked 2026-10-10.

Working notes, draft ids and things checked and dropped are in [AUDIT_WEB_1.ADDITION](AUDIT_WEB_1.ADDITION.md).

## Ledger

<!-- ledger -->
### Web

| id | P | module | owner | status | what is left |
| -- | - | ------ | ----- | ------ | ------------ |
| WEB1-1 | P1 | composer | web | open | A message sent while offline is dropped silently: no retry, no "not sent" mark |
| WEB1-2 | P1 | threads | web | open | Opening a long thread blocks the main thread for ~800 ms on mid-range laptops |
| WEB1-3 | P2 | threads | web | open | Unread counter drifts after a reconnect: deltas are applied twice |
| WEB1-4 | P2 | notifications | web | open | Desktop notifications fire for the thread the user is reading |
| WEB1-7 | P2 | composer | web | open | Pasting a large image freezes the composer while it is encoded |
| WEB1-8 | P3 | a11y | web | open | Thread list items have no accessible name; screen readers say "button" |
| WEB1-5 | P3 | settings | web | deferred | Notification sound picker ignores the OS "do not disturb"; waits for the new settings page |

### Product

| id | P | module | owner | status | what is left |
| -- | - | ------ | ----- | ------ | ------------ |
| WEB1-6 | P2 | notifications | product | open | No agreed rule for which mentions notify on mobile and web at the same time |
<!-- /ledger -->

## 0. In short

Sending is the weak spot: the composer trusts the socket and never confirms delivery (WEB1-1). Threads are slow and miscount unread messages after reconnects (WEB1-2, WEB1-3). Notifications are noisy (WEB1-4), and the product rule behind them is missing (WEB1-6).

## Web — P1

### WEB1-1. A message sent while offline is dropped silently (open)

**In plain words.** The user types, presses Enter, sees the message in the list, and it never reaches anyone. Nothing tells them.

`send()` pushes to the socket and adds the message optimistically, [send.ts:41-63](../../harbor/web/src/composer/send.ts#L41-L63). When the socket is closed, `socket.emit` returns `false` and the result is ignored. There is no outbox and no delivery acknowledgement.

**Fix.** An outbox keyed by client id, retried on reconnect; a "not sent" state with a retry button after 10 s.

### WEB1-2. Opening a long thread blocks the main thread (open)

**In plain words.** A thread with 2,000 replies freezes the tab for most of a second.

`ThreadView` renders every reply at once and runs `linkify` on each, [ThreadView.tsx:88](../../harbor/web/src/threads/ThreadView.tsx#L88).

**Fix.** Virtualize the list; linkify a row on its first paint.

## Web — P2

### WEB1-3. Unread counter drifts after a reconnect (open)

The reconnect handler replays missed events and also refetches counters, so each missed message counts twice, [threads.ts:120-151](../../harbor/web/src/stores/threads.ts#L120-L151).

### WEB1-4. Desktop notifications for the thread being read (open)

`shouldNotify` checks the focused window but not the open thread, [notify.ts:17](../../harbor/web/src/notifications/notify.ts#L17).

### WEB1-7. Pasting a large image freezes the composer (open)

Encoding runs on the main thread; move it to a worker.

## Web — P3

### WEB1-8. Thread list items have no accessible name (open)

Add `aria-label` with the thread title and unread count.

### WEB1-5. Sound picker ignores "do not disturb" (deferred)

Waits for the new settings page, see [PLAN_OFFLINE_MODE](../plans/PLAN_OFFLINE_MODE.md) stage 3.

## Product

### WEB1-6. Which mentions notify on several devices (open)

Web, mobile and email each decide on their own. Needs one rule before WEB1-4 is fixed.
