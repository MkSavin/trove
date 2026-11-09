# Index, queries and drift

The read side: the parsed store as maps, filters over items and documents, references from documents to code, and whether that code changed. Code: `src/core/index`.

```
StoreIndex { documents, items, byName, byRel, gitData, verified, today }
 ├─ queryRows → selectItems / selectDocuments → fieldMatches
 ├─ resolveRef          item id, DOCUMENT#heading or a document name
 ├─ resolveLinks        kind and state of each relative link
 └─ itemDrift
     ├─ itemCodeRefs    links and file names in inline code
     ├─ codeHistory     one git log per root
     └─ hunksSince      one git diff per root and date, for references with lines
```

## Filters

The same syntax in `query`, `summary`, `export`, report configs, generated blocks and MCP. `fieldMatches`: a value is exact (raw text or vocabulary key), `~text` a substring, or a glob, and `!` in front excludes. A field passes when one value matches a plain pattern, if there is any, and none matches a `!` one. A missing field has no values, so only negations accept it.

An item's field reads its ledger column first, then its document's field, so `path=…` works on items. `selectItems` leaves out closed items unless the filter names `state`, and items of an `apart` type unless it names `type`, `path` or `id`.

## Link states

`document` and `store` links exist or are `dead`. `code` links are looked up under a root in `roots`: in the checkout, or at the root's `ref` when it has one. A file missing at the ref but present in the checkout is `unmerged`. A file git ignores is read from the checkout. A root not on this machine, or a target outside every root, is `unchecked`. A pinned link is checked at its commit.

## Drift

`itemChecked` is the item's own `checked` cell when it holds a date or commit, else the document's date. References come from the ledger row and the item's own section. Pinned links are left out on purpose: they point at the past.

`verdict`: named lines changed is `true`; only other lines of the named file changed is `file`; nothing changed is `false`; anything that could not be read is `unknown`. Lines are read as of the last commit on or before `checked`, so lines that merely moved do not count. A reference without lines drifts on any change to the file or folder.

Drift runs only when a query, block or report names it. Results are cached per index and by commit (see `commit-memo.ts`). Synchronous on purpose, because filters are; hence `gitSync`.

## Sections

`itemHeading` prefers a heading that starts with the id over one that only mentions it. `idToken` matches the id as a whole token, so `WEB1-1` never matches `WEB1-10`.

## Invariants

- **Named lines changing drifts; changes outside them are `file`.** Checked: INV:extras/line-drift.
- **An `apart` register stays out until a filter names where it is.** Checked: INV:deferred/register-apart.

## Errors

A filter on an unknown field matches nothing, as a missing value. `git` that cannot read a root gives `unknown`, not an error. Bad arguments, such as a malformed `--lines`, are `TroveError`.
