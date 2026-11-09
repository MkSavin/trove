# Live views, reports and summaries

Text in the store that trove writes from the store: whole report files, generated blocks inside hand-written documents, and dated summary documents. Code: `src/core/reports`, `src/core/live`, `src/core/summaries`.

```
planGenerated(index)          on every edit and every report run
 ├─ planReports               `reports:` → whole files, not documents
 └─ planEmbeds                files with blocks; snapshots are skipped
     ├─ fillEmbeds            <!-- regulation:placement -->
     └─ fillLiveBlocks → renderView
          from the index      items, documents, progress, counts, placement
          from GitData        branches, changes, trend

openStore → withStoreGitData → loadGitData   git read once, per distinct block key
```

## Blocks

A block is `<!-- trove:<view> key=value… -->` … `<!-- /trove:<view> -->` outside fenced code. Everything between the markers is rewritten; text around them is never touched. Layout options are `as`, `columns`, `group`, `sort`, `by`, `label` and `format`; every other option is a filter, added to the document's `filter:` field.

`renderView` is synchronous, so views that read git get their data before filling. `loadGitData` scans the texts that will be refilled and stores a `Fact` per key: a value, a problem, or nothing. No value means the root is not on this machine, and the block stays as it is. A problem, such as an unknown root or base, becomes a `live-block` error.

Blocks that cannot be built stay as written and come back as `problems`.

A store's regulation files outside the documents, such as its `AGENTS.md`, are refilled too.

## Snapshots

`isSnapshot`: a document in the archive, or a document of a summary type whose `date` has passed. Its blocks are never refilled and `live-block-stale` is silent. `trove refresh` may refill a named summary past its date, never an archived document.

## Reports

`planReport` renders with the old date first: when the text is the same, the file is left alone, so a rebuild is not a diff. `report` refuses while check is red.

## Links in copied text

Text a block copies from a document, and text a summary carries over, is rebased on the folder of the document that shows it (`rebaseText`). A link above the store must keep its way out; see `workarounds/posix-relative-cwd.md`.

## Git views

- **`changes`** compares the store's ledgers now and at a start commit. `since=previous` is the commit that first added the previous summary of the kind, found with `--no-renames` so that git does not take a new summary for the old one renamed. `since=<date>` follows `--first-parent`, so an older commit of a branch merged later never counts.
- **`trend`** counts opened, closed and moved per week from ledger history; weeks before the store existed are left out.
- **`branches`** lists a code root's branches against named bases.

## Summaries

`newSummary`: the kind's template (or the built-in layout) rendered as a draft, `carryWritten` from `--from`, earlier summaries of the kind sent to the archive with `superseded_by` set, then the blocks filled, in that order, so `since=previous` can find what was replaced.

`carryWritten` keeps written text by its `<!-- write: … -->` label first, then by the block or heading above it, then by section. A block is keyed by its kind and its place among blocks of that kind under its heading, so changed options keep its text.

A summary with an empty write place is a draft. `write-place` reports what is left.

## Invariants

- **An archived document is a snapshot.** Checked: INV:live/archive-snapshot.
- **A summary keeps its blocks once its date has passed.** Checked: INV:ops/summary-snapshot.
- **A bad block is left alone and reported.** Checked: INV:live/bad-blocks.
- **A link above the store keeps its way out, wherever the process runs.** Checked: INV:summaries/link-above.

## Errors

A bad block is a `live-block` diagnostic, not an exception. `summary new` throws `TroveError` for an unknown kind or a taken name.
