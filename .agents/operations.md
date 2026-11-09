# Operations and plans

Every change to a store is a `Plan`: new text per file, computed in memory, checked, then written. Nothing edits a document any other way. Code: `src/core/ops`, `src/core/edit`.

```
CLI command / MCP tool
 └─ builds a Plan      closeItem, addItem, moveItem, newDocument, archivePlan, retypePlan, ...
     └─ runOperation
         ├─ applyPlan
         │   ├─ withChanges     the index as it would be after the plan
         │   ├─ runRules        before and after → errors the plan introduces
         │   ├─ planGenerated   reports and blocks rebuilt from the "after" index
         │   └─ write           only with no introduced error and no dry run
         └─ syncOutcome         see sync.md
```

## Plan

`changes` holds one entry per file: `text` undefined deletes, `from` marks a move. `message` is the commit message. `notes` are shown to the user. `tolerate` names rules whose errors in the changed files do not block this plan: a new document tolerates `lifecycle`. `draft` names a new document that stays uncommitted (see `sync.md`).

Plan builders are pure over the index, apart from reading a template or companion they need. They throw `TroveError` for what cannot be planned at all: unknown id, unknown type, a `|` in a cell.

`thenPlan` chains: the second plan is built on the index the first leaves, and `fold` merges changes to one file, so `close --archive` is one plan and one commit.

## Patches

`src/core/edit` turns a document into `Patch` spans over its source text. `applyPatches` sorts them, refuses overlaps, applies from the end. `eolOf` reads the document's line break, and every inserted text uses it. Cells keep a padded column's width when the text fits.

## Refusal

`introducedErrors` compares diagnostics before and after by file, rule and message, counting duplicates, and maps a moved file's old errors to its new path. Errors the store already had never block. Warnings never block.

The result is `Outcome`: `written` false and `introduced` listing the errors. The CLI prints them and exits 1; MCP answers with `refused` and the same list.

## Items

- **Ids.** `nextNumber` scans the text of every document, archive included, so a closed number never comes back.
- **Close.** A type with `closeInto` moves the row and section into its companion, `<NAME>.<TYPE>.md` beside it, created on first use and archived with it. Other types drop the row and mark the section's heading.
- **Move and defer into a register.** The row and section go to the target's next id; a source with a `moved` outcome keeps a closed row naming the new id.
- **Recheck.** Sets the item's `checked` cell to the root's commit, or today when it points into no root or several. A table without the column gets it in its header.

## Documents

- **New.** Name from the topic (Cyrillic transliterated), next series number, template or built-in layout. Without a body it is a draft.
- **Archive.** Moves to `<archive>/<rel>`, sets the status, rebases its own links, retargets links from other documents, takes its companion along.
- **Retype.** Folder, prefix, status, title, links and name references follow.

Relative links that leave the store rely on `relativeTo`; see `workarounds/posix-relative-cwd.md`.

## Adding an operation

A pure builder in `src/core/ops` returning a `Plan`, wired to `runPlan` in the CLI and `runPlanTool` in MCP. Never write files directly: the check and the report rebuild are in `applyPlan`.

## Invariants

- **A plan that adds an error writes nothing.** Checked: INV:mcp/refused-edit.
- **Edits keep the document's line breaks.** Checked: INV:ops/keeps-crlf.
- **Numbers of closed items are never reused.** Checked: INV:ops/closed-number.

## Errors

`TroveError` while building, a refused `Outcome` after checking, and `overlapping edits in one file` when one plan patches the same span twice, which is a bug in the builder.
