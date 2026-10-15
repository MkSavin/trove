---
type: spec
status: not started
date: 2026-10-05
checked: 2026-10-05
scope: "api/search, web/src/search"
supersedes: SPEC_SEARCH.md
verify: nothing in code yet; start from `api/search/index.go`
---

# SPEC_SEARCH_V2 — search across threads and files

**Status:** not started. Replaces SPEC_SEARCH after the storage audit. Checked 2026-10-05.

## Why a second version

The first version indexed messages only and kept the index in the main database. Files now need search too, and the index moves to its own service.

## Scope

- Messages, thread titles and file names in one query.
- Results ranked by recency, then by match.
- No full-text search inside files in this version.
