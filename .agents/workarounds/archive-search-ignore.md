---
anchor: WORKAROUND:archive-search-ignore
rule: List the archive folder in the store's .ignore; its leading dot is not enough.
---

**Symptom.** An assistant's search of a store returns old findings from the archive next to the live ones.

**Mechanics.** Ripgrep-based tools often run with `--hidden`, so a folder named `.archive` is searched like any other. A `.ignore` file still applies under `--hidden`, and it never affects git.

**Fix.** `ignoreArchive` adds the archive folder to `.ignore` at `init` and `migrate`, and `client add kimi` backfills an older store. `trove doctor` says when the line is missing. Searching the archive on purpose still works by naming it.

Checked: INV:search-ignore/init-writes.
