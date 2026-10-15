# Harbor docs — store notes

Local facts only; the regulation itself is the trove README and `trove.yaml`.

| where | what |
| ----- | ---- |
| `../harbor` | the code: `web/`, `api/`, `mobile/` |
| owners | web — Ana, api — Bo, mobile — Chen, infra — Dee |
| `trove check` | before every commit |

## What goes where

Built from `purpose` of each type in `trove.yaml`.

<!-- regulation:placement -->
| type | where | what belongs here |
| -- | -- | -- |
| `audit` | `audits/AUDIT_` | Findings about existing code, with a ledger of what is left to fix. Not for code that is still to be written: that is a spec or a plan. |
| `resolved` | `audits/AUDIT_` | Closed items of one audit with their write-ups, and its working notes: draft ids, corrections, what was checked and dropped. Carries no open items. |
| `spec` | `specs/SPEC_` | The behaviour to build, as a contract. Archived once fully built; how the system works today is not a spec. |
| `plan` | `plans/PLAN_` | Work in stages, each with a done-when, including the plan of a process such as a rollout or a migration. |
| `research` | `research/RESEARCH_` | The report of a finished investigation: the question, what was found, the conclusion or recommendation. An investigation still under way is a study; work to do is a plan. |
| `incident` | `research/INCIDENT_` | One incident or complaint taken apart from logs: timeline, causes, follow-ups filed elsewhere. |
| `study` | `research/STUDY_` | An investigation still running or still to run: the question, hypotheses, steps and what to measure. Its answer goes into a research report. |
| `external` | `external/EXTERNAL_` | A report received from outside, kept as it came. |
| `prompt` | `prompts/PROMPT_` | A large task for an AI agent that is run again, refined and handed to colleagues. |
| `debt` | `store root` | What plans promised from other teams and the code does not do yet. |
| `risk` | `store root` | Assumptions of shipped code that nobody has verified on a real device yet. |
| `summary` | `summaries/SUMMARY_` | A dated look at one slice of the store: generated status blocks plus written analysis. Create it with `trove summary new <kind>`; archive it when a newer one replaces it. |
| `backlog` | `store root` | Generated from other documents; never edited by hand. |
<!-- /regulation:placement -->
