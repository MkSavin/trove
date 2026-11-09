---
anchor: WORKAROUND:posix-relative-cwd
rule: Call posix.relative only with absolute paths; store-relative ones go under a deep fake root.
---

**Symptom.** A link leading above the store loses or gains a `../` when a report or summary is rebuilt, depending on the folder trove runs from. It shows at a drive root, in a shallow folder and on Windows.

**Mechanics.** `posix.relative` resolves relative arguments against the process's working folder, and `..` stops at the root of that path.

**Fix.** `relativeTo` joins both paths onto a fake absolute root 32 levels deep, so `../` above the store always has somewhere to go and the working folder never matters.

Checked: INV:summaries/link-above.
