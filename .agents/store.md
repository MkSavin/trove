# Store and config

A store is a git repository of Markdown documents with a `trove.yaml` at its root. This module finds the store a command means, loads its config and returns one `Store` value that everything else works from. Code: `src/core/store`, `src/core/config`.

```
openStore(cwd, store?, config?, today?, cache?)
 ├─ locateStore        which folder: see the order below
 ├─ parseConfig        YAML → zod schema → validateConfig
 ├─ mergeRules         built-in rules + plugins
 ├─ buildIndex         listDocuments → parseDocument for each
 └─ withStoreGitData   git reads for the blocks that need them
```

## Finding the store

`locateStore` tries, in order: `--store` (a lowercase name from the project's pointer, anything else is a path); a `trove.yaml` at or above the working folder; the project's pointer; the registry; a store next to the project whose `roots` name it.

The project root is the nearest folder with `.trove.yaml`, else the git top level. The pointer is `.trove.yaml` (committed, written by `--share`), else `trove.yaml` in the git common directory (this clone only, shared by its worktrees, never shown by git).

The registry is `$TROVE_HOME/registry.yaml`, by default `~/.trove/registry.yaml`: per machine, project root to stores.

With several candidates the one whose `scope` globs cover the working folder wins. No unique match is an error that asks for `--store`.

## What counts as a document

`documentPath` keeps `.md` files outside hidden folders, outside `node_modules`, outside `ignore` and not a report's `output`. The one hidden folder that counts is the archive folder at the top level. A bare name in `ignore` matches anywhere; a pattern with `/` or `*` matches store paths. Reports are not documents: rules and queries never see them.

## Config

`Bun.YAML.parse`, then `withViewLabels` (labels of generated blocks a config leaves out, in its language), then the strict zod schema in `schema.ts`, then `validateConfig` for cross-references the schema cannot state. Vocabularies map key to label: documents may hold either, `keyOf` reads both, `labelOf` writes the label.

`schema/config.schema.json` is generated from the zod schema with `bun run schema`. Change the schema, run it, commit both.

`vocabulary.ts` is the only place that decides which ledger a type uses (`ledgerOf`, `closedLedgerOf`), which statuses a document keeps in the archive (`archivedStatuses`) and whether it is finished (`isFinished`).

## A new store

`initStore` writes the scaffold into an empty folder, builds the reports, refuses if the result does not pass `check`, then runs `git init`, installs a pre-commit hook that runs `trove check`, sets the `ours` merge driver that `.gitattributes` names for reports, commits, writes the pointer and registers the project. `--no-git` skips the git steps. The scaffold also lists the archive in `.ignore`; see `workarounds/archive-search-ignore.md`.

## Long-running processes

`openConfig` stops after the config, for callers that need no index, such as the MCP uncommitted-changes notice. The MCP server passes a `StoreCache`. A cached root is kept while its `trove.yaml` exists, a config while its text is the same, a parsed document while its text and config object are the same. The disk is read on every open, so edits made outside the server show up.

## Invariants

- **Several stores are told apart by scope.** Checked: INV:store/scope-pick.
- **A path through a symlink is the same path.** `toplevel` keeps the caller's spelling; `samePath` and `isInside` compare real targets. Checked: INV:store/symlink-paths.
- **Config mistakes are caught before any document is read**, cross-references included. Checked: INV:config/broken-references.
- **A YAML syntax error names the file, never a line.** Checked: INV:config/yaml-origin.

## Errors

`TroveError` means the user can fix it: no store found, several stores, invalid config or pointer, store not on this machine. The CLI prints it and exits 2; MCP returns it as a tool error. A pointer or registry that fails its schema is an error, never ignored. A config with an unknown rule id is a `check` warning, not an error.
