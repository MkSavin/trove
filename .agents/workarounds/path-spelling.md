---
anchor: WORKAROUND:path-spelling
rule: Compare paths through their real targets, ignoring case on Windows; never by string.
---

**Symptom.** A store is reported as nested in another repository, or a project is not found in the registry, when the path goes through a symlink, macOS's `/var`, or differs in case on Windows.

**Mechanics.** `git rev-parse --show-toplevel` answers with symlinks resolved, while callers hold the path as they spelled it. Windows treats one folder under any case.

**Fix.** `toplevel` re-spells git's answer on the caller's path. `samePath` and `isInside` compare `realPath` results, with case folded on Windows.

Checked: INV:store/symlink-paths.
