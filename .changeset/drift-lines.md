---
"trove": minor
---

`drift` is sharper. Items point at code through links and inline file names (`` `send.ts:41` ``, `` `composer/send.ts` ``) in their ledger row and their own section; a bare name is found with `git ls-files` and counts only when it is unique. A reference that names lines drifts only when those lines changed, read as of the last commit on or before `checked`. `drift=false` now means checked and unchanged, and `drift=unknown` covers items with nothing that could be checked; a `drift` cell shows `—` and `?` for them.
