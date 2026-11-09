---
anchor: WORKAROUND:git-quoted-paths
rule: Run git with core.quotePath=false wherever its output names files.
---

**Symptom.** An item that points at a file with a Cyrillic name never drifts, and resync cannot find the file.

**Mechanics.** By default git prints non-ASCII paths in double quotes with octal escapes, which then match no real path.

**Fix.** `-c core.quotePath=false` on `git log`, `git diff` and the resync comparisons.

Not checked automatically: no fixture holds a non-ASCII file name.
