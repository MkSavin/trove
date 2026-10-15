---
"trove": minor
---

`trove resync --seal` closes a finished move: after the last resync it writes `MOVED.md` and a first line in `AGENTS.md` into the archive and commits them there. `trove doctor` shows the migrated-from archive and warns when it changed after the last resync.
