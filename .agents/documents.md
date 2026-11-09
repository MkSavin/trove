# Documents and ledgers

Turns one Markdown text into a `Document`: pure, no disk and no git. Everything downstream, including every edit, works from the offsets this module records. Code: `src/core/document`, `src/core/markdown`, `src/core/text/lines.ts`.

```
parseDocument({ path, rel, text }, config)
 ├─ splitLines, fencedLines   offsets into the original text
 ├─ parseFrontMatter          meta, type, status
 ├─ parseHeadings, findLinks  outside fenced code
 ├─ readStatusLine            first body lines, if there is a front matter
 ├─ findBlocks → readLedger   ledger types and resolved-of types
 ├─ findBlock → readPrompt    prompt-body types
 └─ readStages                stages types, unfinished documents only
```

## Lines and offsets

`splitLines` keeps `start` and `end` offsets into the source and treats `\r\n` and `\n` alike. Edits are spans of the source text, so a parse that normalised line ends would corrupt every later patch.

## Front matter

Read line by line as `key: value`, because values in such archives are free text that strict YAML rejects. One pair of matching quotes is stripped. The `front-matter-yaml` rule warns separately when a strict reader such as GitHub would break on a value.

## Types are capabilities

`capabilities` in the config, not code, decide what a type carries. `ledger`, `prompt-body`, `status-line`, `freshness`, `generated`, `resolved-of`, `stages`, `series` and `versions` each enable one reader or one rule. Ask `hasCapability`, never compare type names.

## Ledgers

A ledger is one or more `<!-- <marker> -->` blocks (`ledger` by default), each holding Markdown tables. A type's own `ledger:` replaces the store's. Columns are matched by header label or key, so tables with and without optional columns live side by side.

Each `|` splits a cell, also an escaped one: an escaped pipe would still be a broken cell for importers.

A row may leave out trailing cells of optional columns (`fitsHeader`). A row that does not fit, or has no id, is no item; the `ledger-row-shape` rule reports it.

`Item.open` says its status is one of `ledger.open`, which keeps the document out of the archive. `Item.closed` says it sits in a `resolved-of` document. A cell of `—`, `–` or `-` reads as empty. `Item.section` is the heading above its table, used by ledgers with one table per team.

`closedLedgerOf` gives a `resolved-of` type the ledger of its base type with the status vocabulary swapped for the closing outcomes and no open statuses.

`apart` types, such as the register of deferred work, are read like any other; only queries treat them differently (see `query.md`).

## Stages

`readStages` takes whichever comes first in the body outside generated blocks, ledgers and code: a task list, a table with a status column, or two or more sibling headings or bold labels sharing a code prefix. Finished documents have no stages. `stages` in the config names the status columns and the done words.

## Invariants

- **Offsets point into the original text, CRLF included.** Checked: INV:markdown/crlf-offsets.
- **Parsing never fails on content.** Broken documents still parse; rules report what is wrong. Not checked automatically: "any input" cannot be enumerated, though `test/fixtures/broken` holds one planted error per rule.

## Errors

None by design: `parseDocument` does not throw on bad content. Missing parts are `undefined`, and a status or type outside the vocabulary leaves `status` or `typeConfig` undefined for the rules to report.
