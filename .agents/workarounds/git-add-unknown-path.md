---
anchor: WORKAROUND:git-add-unknown-path
rule: Hand git add only paths that are on disk or known to git.
---

**Symptom.** Archiving a document that was never committed fails to commit, and leaves the store dirty.

**Mechanics.** The plan names the old and the new path. `git add -- <path>` stops with `pathspec did not match` for a path that is neither on disk nor in the index, and adds nothing, the new path included.

**Fix.** `stageable` keeps the paths that exist or that `git ls-files` knows.

Checked: INV:sync/never-committed.
