---
type: prompt
status: current
date: 2026-09-27
checked: 2026-10-10
scope: "any web subsystem"
produces: "audits/AUDIT_<AREA>_<N>.md with a ledger"
model: a strong model as lead, up to 3 sub-agents
verify: paths in step 1 exist in `../harbor/web`
---

# PROMPT_AUDIT_WEB — audit of a web subsystem

**Status:** current. Used for AUDIT_WEB_1. Checked 2026-10-10.

The task below is pasted into an assistant as is; angle brackets are filled in at launch.

## Runs

| date | result |
| ---- | ------ |
| 2026-09-28 | AUDIT_WEB_1, 8 items |

<!-- prompt -->

# Task: audit <area> of the Harbor web client

1. Read `../harbor/web/src/<area>` and its tests.
2. List what can lose user data, block the UI or mislead the user.
3. For each finding: a heading `### <SLUG>-<n>. <one line> (open)`, a plain-words paragraph, code links, a fix.
4. Put every finding in the ledger table with priority, module, owner and what is left.
5. Run `trove check` and fix what it reports.
