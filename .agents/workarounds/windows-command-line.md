---
anchor: WORKAROUND:windows-command-line
rule: Pass paths to git in batches of 100 at most.
---

**Symptom.** Drift on a store that references many files fails on Windows only.

**Mechanics.** A Windows process's command line is limited to 32767 characters, and a `git log` or `git diff` for every referenced path passes that.

**Fix.** `chunks` splits paths into batches of 100, and `codeHistory` and `hunksSince` run one git call per batch.

Not checked automatically: it needs several thousand long paths on a Windows runner.
