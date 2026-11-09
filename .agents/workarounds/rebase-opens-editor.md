---
anchor: WORKAROUND:rebase-opens-editor
rule: Run git pull --rebase and rebase --continue with core.editor=true.
---

**Symptom.** An operation in push mode hangs while settling a conflict in a generated report.

**Mechanics.** `git rebase --continue` starts an editor for the commit message, and nobody is at that terminal when an assistant or a hook runs trove.

**Fix.** `-c core.editor=true` makes the editor the `true` command, which exits at once and keeps the message.

Checked: INV:sync/report-conflict.
