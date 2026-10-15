---
type: incident
status: closed
date: 2026-09-20
checked: 2026-09-24
scope: "api/auth, infra/"
verify: alert `auth_5xx_rate` exists in `infra/alerts.tf`
---

# INCIDENT_LOGIN_OUTAGE_2026-09-20 — 40 minutes without logins

**Status:** closed. Root cause fixed, follow-ups filed as API2-1 and API2-4. Checked 2026-09-24.

## Timeline

| time (UTC) | event |
| ---------- | ----- |
| 09:12 | certificate of the identity provider rotated |
| 09:14 | logins start failing with 500 |
| 09:41 | on-call notices from user reports; no alert fired |
| 09:52 | old certificate pinned back, logins recover |

## Causes

- The provider's signing certificate was pinned in config instead of fetched from its metadata.
- No alert on the auth error rate.

## Follow-ups

- Fetch signing keys from provider metadata. Done.
- Alert on `auth_5xx_rate`. Done.
