---
type: resolved
base: AUDIT_WEB_1.md
status: current
date: 2026-09-28
checked: 2026-10-10
scope: "web/"
---

# AUDIT_WEB_1.RESOLVED — working notes for the web audit

**Status:** current. Addendum to AUDIT_WEB_1; carries no open items. Checked 2026-10-10.

Report: [AUDIT_WEB_1](AUDIT_WEB_1.md).

## Draft ids

| draft | final |
| ----- | ----- |
| send-1 | WEB1-1 |
| thr-2 | WEB1-2 |
| thr-3 | WEB1-3 |

## Checked and dropped

- **Emoji picker leaks listeners.** It does not: the `useEffect` cleanup removes them on unmount.
- **Typing indicator floods the socket.** Already throttled to one event per 3 s.
