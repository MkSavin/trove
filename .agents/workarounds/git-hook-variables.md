---
anchor: WORKAROUND:git-hook-variables
rule: Strip GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE and GIT_PREFIX from every child's environment.
---

**Symptom.** Inside a pre-commit hook, reads of a code root or a temp repository answer for the wrong repository: tests fail that pass alone, and drift or links report nonsense.

**Mechanics.** git exports these variables to its hooks, and they override the working folder for every git started below. `cwd` alone does not reach the intended repository.

**Fix.** `gitEnv` drops them, for `git`, `gitSync` and `runShell`. `test/setup.ts` deletes them too, because tests call git directly.

Checked: INV:git/hook-variables, INV:verify/closed-stdin.
