# Migrate and resync

Builds a store from an archive kept by hand, keeps it in step while people still write to the archive, and finally marks the archive as moved. Code: `src/core/migrate`.

```
migrateArchive(source, target)
 ├─ copySource          clone with history, uncommitted work on top
 ├─ inferConfig → fit   a preset widened to what the documents use
 ├─ writeReports        rebuilt from the documents
 └─ recordOrigin        git config + refs/trove/source-state

resyncStore → snapshotSource → changesBetween → pairMoves → git apply --3way
continueResync          once no file holds conflict markers
sealSource              the only step that writes into the archive
```

## Migrate

The target must be empty or absent. The config is inferred: language, extra types, statuses and how they are written, fields, ledger columns per type, status lines only where documents have them, the old backlog's group order. `--drop` names old tooling to leave behind. Counts of documents and items are taken before and after the store is built; a difference comes back as `lost`.

The archive's remote is never set on the store: pushing there would turn that repository into the store for everyone still writing to it. Migrate prints a `trove remote add` line and how many commits that remote lacks.

## Resync

`refs/trove/source-state` is the source as the store last took it in. It lives only in this clone; a store migrated before the ref existed falls back to the parent of its migration commit. `snapshotSource` takes the source's current state, uncommitted work included, as a commit in the store.

Changes are applied three-way, so the store's own edits stay. A file the store has moved into its archive folder gets the change there. A move across the archive mirror in the source is one move here. The config, dropped files and reports stay the store's.

A conflict leaves markers, sets `refs/trove/source-pending` and waits for `--continue`. A second resync refuses meanwhile, as does one over uncommitted changes.

## Seal

`--seal` brings the last changes, writes `MOVED.md` into the archive, puts a notice on the first line of its `AGENTS.md` and commits only those two files there. It refuses while the archive holds work the store has not taken in.

## Invariants

- **Only `--seal` writes into the archive.** Checked: INV:migrate/reads-only.
- **A clash waits for a person, then continues.** Checked: INV:resync/clash-waits.

## Errors

`TroveError` for a source that is missing, a target that is not empty, a store that does not know its source (`--source` supplies it), and for leftover conflict markers on `--continue`. `trove doctor` warns when the archive changed after the last resync.
