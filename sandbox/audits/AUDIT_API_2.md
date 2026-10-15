---
type: audit
status: open
date: 2026-10-02
checked: 2026-10-12
scope: "api/ (auth, rate limits, storage)"
slug: API2
supersedes: AUDIT_API_1.md
verify: API2-1 token refresh in `api/auth/refresh.go`; API2-3 limiter keys in `api/ratelimit/keys.go`
---

# AUDIT_API_2 — API: auth, rate limits, storage

**Status:** open. 4 open items; the second API audit, after AUDIT_API_1. Checked 2026-10-12.

## Ledger

<!-- ledger -->
| id | P | owner | status | what is left |
| -- | - | ----- | ------ | ------------ |
| API2-1 | P0 | api | open | A refresh token stays valid after logout on another device |
| API2-2 | P1 | api | open | Attachment upload accepts any content type and serves it inline |
| API2-3 | P2 | api | open | The rate limiter keys by IP only: a whole office shares one bucket |
| API2-4 | P2 | infra | open | Database backups are not restore-tested; the last good restore is unknown |
<!-- /ledger -->

## API2-1. Refresh token survives logout elsewhere (open)

`Logout` revokes the access token only; refresh tokens live 30 days, [refresh.go:55](../../harbor/api/auth/refresh.go#L55).

## API2-2. Uploads served inline with any content type (open)

Stored HTML attachments open in the app origin. Serve them with `Content-Disposition: attachment` from a separate domain.

## API2-3. The rate limiter keys by IP only (open)

Key by user id when authenticated, by IP otherwise.

## API2-4. Backups are never restore-tested (open)

A weekly restore into a scratch database, with an alert on failure.
