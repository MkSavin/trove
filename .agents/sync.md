# Sync and git

What happens in git after an operation, and the one wrapper every git call goes through. Code: `src/core/sync`, `src/core/git`.

```
syncOutcome(store, outcome)   after an operation, only the files it changed
syncStore(store, message?)    hand edits: reports rebuilt, everything staged
pushStore(store)              commits made elsewhere, such as a resync
 └─ record
     ├─ isRepositoryRoot      else idle with a warning
     ├─ isGreen               else idle with a warning
     ├─ commitPaths           stage the paths, commit if anything is staged
     └─ pushWithRebase        only in mode `push`
         ├─ push
         ├─ pull --rebase → settleGenerated
         │     reports: take the upstream copy
         │     hand-written: settleLiveConflict, else abort
         ├─ rebuild reports → commit "docs: rebuild reports"
         └─ push again
```

## Modes

`sync:` in `trove.yaml`: `off` leaves git alone, `commit` makes one commit per operation, `push` also pushes. `syncStore` refuses `off` outright.

A draft is written but not committed: `doc new` without a body, or `summary new` with an empty write place. The operation warns, the reports it rebuilt wait with it, and the next `trove sync` commits them.

## Rebase conflicts

During a rebase `--ours` is the upstream side. A conflict in a report takes that copy, because reports are rebuilt right after. A conflict only inside `trove:` blocks is settled by `settleLiveConflict`: the three sides are merged with their blocks emptied, and the rebuild refills them. Any other conflict aborts the rebase and keeps the local commit, with a warning that names the file.

A store is prepared with `<report> merge=ours` in `.gitattributes` and the `ours` driver in its git config, so ordinary merges do not stop on reports either.

## The git wrapper

`git`, `gitOrThrow` and `gitSync` are the only ways to run git. They close stdin, drop hook variables and never throw on a non-zero exit unless asked. `gitSync` exists for reads during synchronous queries, whose callers cache per index. `raw` keeps the leading spaces porcelain formats use as data. See `workarounds/child-stdin-closed.md` and `workarounds/git-hook-variables.md`.

`commit-memo.ts` keeps git results keyed by the commit they ran against, in memory and in `trove/commit-cache.json` inside the store's git folder. A new commit is a new key; a broken cache file reads as empty.

`deletion.ts` and `permalink.ts` serve `links --fix`: where a deleted file can still be read, and a web link when `origin` is on GitHub or GitLab.

## Invariants

- **Red stores do not commit, and `off` leaves git alone.** Checked: INV:sync/red-check.
- **A store nested in another repository never commits into it.** Checked: INV:sync/nested-repository.
- **A conflict in a generated report is rebuilt, not left to a person.** Checked: INV:sync/report-conflict.
- **A conflict in a hand-written file stops before pushing and keeps the local commit.** Checked: INV:sync/hand-conflict.
- **A draft stays out of the commit until `trove sync`.** Checked: INV:sync/draft-uncommitted.
- **Nothing is ever force-pushed.** Not checked automatically: no code path passes a force flag, and a test could only restate that.

## Errors

`record` does not throw for ordinary git trouble: the warning goes into `SyncResult.warnings` and the operation still counts as written. `gitOrThrow` throws `TroveError` for a step that must not fail. `syncStore` throws when sync is off or check is red.
