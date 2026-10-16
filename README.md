<div align="center">

# trove

**A plain-Markdown archive of audits, plans and specs, with one checker.**

The rules live in a config file, not in prose. Markdown stays the source of truth: people read the files as they are, and the toolkit checks, queries and reports on them.

[![Bun](https://img.shields.io/badge/runtime-Bun%201.4-f9f1e1?logo=bun&logoColor=000)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org)
[![Biome](https://img.shields.io/badge/lint-Biome-60a5fa?logo=biome&logoColor=fff)](https://biomejs.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**English** · [Русский](README.ru.md)

</div>

---

```console
$ trove check
audits/AUDIT_WEB_1.md
  12  error  status line says closed, header open                 status-line
  21  error  7 cells against 6 in the header; a | inside a cell?  ledger-row-shape

✖ 2 errors, 0 warnings, 1 info · 20 documents · 5 ledgers · 16 open items
```

## Why

- **One regulation.** Document types, statuses, ledger columns and lifecycle are data in `trove.yaml`. A new type, column or report is a config change, not a code change.
- **Files are the truth.** Every document is ordinary Markdown in git. Anything the toolkit keeps, like the index or generated reports, is rebuilt from the files.
- **Slices, not files.** `query` and `show` return one item or one section, so neither a person nor an assistant has to open a 200 KB backlog to read one finding.

## Quick start

Needs git. Take a single-file binary from [Releases](https://github.com/MkSavin/trove/releases) and put it on `PATH` as `trove`, or install from source with [Bun](https://bun.sh) ≥ 1.4.

```sh
bun add -g github:MkSavin/trove    # or a binary from Releases
cd ~/git/app                       # your project
trove init                         # ../app-trove: a green store, linked and committed; nothing in the project tree
trove doc new audit "web client" --scope web/
trove item add AUDIT_WEB_CLIENT_1 priority=P1 owner=web "what=Offline sends are lost"
trove item close WEBCLIENT1-1 --commit 3f2a9c1
```

A teammate runs `trove clone <store-url>` in their clone of the project: the store lands next to it and is linked, again with nothing in the project tree. With `trove init --share` the project instead commits `.trove.yaml`, and a plain `trove clone` brings every store it names. Already keep such an archive by hand? `trove migrate ../notes ../app-trove` builds a store from it: git history and uncommitted work come along, the config is fitted to the documents, and the archive itself is only read.

## Commands

**Set up**

| command | does |
| ------- | ---- |
| `trove init [--path] [--remote] [--lang en\|ru] [--share] [--no-git]` | Create a store for the current project: folders, config, notes, reports, git with a pre-commit check, a link in `.git/trove.yaml` (with `--share`, a committed `.trove.yaml`), an entry in `~/.trove/registry.yaml`. Asks at most three questions, each with a default; `--yes` takes them all. |
| `trove clone [<store-url>] [--path] [--name] [--share]` | Clone a store by its address next to the project and link it privately; without an address, clone and register the stores the project's pointer names. |
| `trove resync [--continue] [--seal]` | Bring what changed in the migrated-from archive since the last migration or resync, committed or not, three-way: the store's own edits stay, a document the store archived gets the change in the archive, a document the archive moved into its archive folder is moved in the store too, conflicts wait for `--continue`. The archive is only read, except with `--seal`. |
| `trove migrate <archive> <store> [--drop FILE] [--project DIR [--link]]` | Build a store from an existing archive: clone with history, uncommitted work as its own commit, a config fitted to the documents (language, extra types, statuses and whether they are written as keys, fields, ledger columns per type, status lines only where documents have them, what the archive keeps, the old backlog's group order), rebuilt reports, a count of documents and items before and after. The archive is only read, and its remote is not carried over. `--project` links the store to that project privately, `--link` through a committed `.trove.yaml`. |
| `trove store add <name> --scope <glob>` | Another store for a team with its own access; commands run under `--scope` folders go to it. |
| `trove remote add <url>` | Connect a local store to a remote repository, switch `sync` to `push` and push the history. |
| `trove client add <claude\|cursor\|codex> [--local]` | Register the MCP server and the skills for an assistant in this project; `--local` keeps them on this machine and out of the project (Claude Code). |
| `trove doctor` · `trove forget` | Show the project, its stores and their health; inside a store, that store and the project the registry ties it to · drop the project from this machine's registry. |

**Read**

| command | does |
| ------- | ---- |
| `trove check [file] [--all] [--json] [--verify]` | Run every rule; exits 1 on errors. `--all` also lists every document. `--verify` also runs the `verify-cmd` of every document in work and exits 1 when one fails (see repeatable checks below). |
| `trove query items status=open owner=web [--columns a,b]` | Filter items or documents by any field (see filters below). Items show the columns of the ledgers they come from, `id` first; `--columns` picks others. |
| `trove summary show [kind] [filters]` | A summary on screen, nothing written: a configured kind, or counts, open items by document and documents in work under the given filters. |
| `trove show WEB1-4` | Print one item's section, a closed one too; when no ledger holds the id, every section titled by it, archive included. Also takes `DOC#heading`, or a document name for its outline. |
| `trove prompt PROMPT_X [--copy]` | Print a prompt's task text, or copy it; Cyrillic survives on Windows too. |
| `trove report [name...]` · `trove rules` | Rebuild generated reports and every live generated block · list rules with their effective level. |
| `trove refresh [doc...]` | Refill the generated blocks of the named documents, a summary past its date too, or of every live one; after a hand edit inside a block. |
| `trove links [--dead]` | Relative links to documents and code; code is checked under `roots` present on this machine, in the checkout or, with `{ path, ref: origin/main }`, at that commit whatever branch is checked out; files git ignores there, such as installed packages, are read from the checkout. `--dead` ends with `N dead of M links`. |
| `trove refs <file\|dir\|glob> [--lines A-B] [--all]` | Open items, and plans, specs and other ledger-less documents in work, that point at code, found the way drift finds references; a path is relative to the code root, to the working folder, or absolute. `--lines` keeps references that touch those lines or name none; `--all` adds closed items and archived documents. |
| `trove export items [filters] --format csv\|json [--columns a,b]` | Rows for a CRM or a spreadsheet; RFC 4180 CSV. |
| `trove serve [--port N]` | A read-only dashboard at `http://127.0.0.1:7480`, this machine only: documents and items with the same filters as `query`, a document's text, live summaries. Files are read again on every request. |
| `trove schema` | Print the JSON Schema of `trove.yaml`. |

**Edit.** Every edit patches only its own lines, keeps CRLF, is checked in memory first and is not written if it adds an error. Generated reports are rebuilt in the same step; `--dry-run` prints the line diff instead.

| command | does |
| ------- | ---- |
| `trove doc new <type> <topic> [--scope] [--field k=v]` | A document from the type's template: folder, prefix, next series number, slug. The name is the topic's first eight words in capitals, Cyrillic transliterated (`чего не хватает` → `CHEGO_NE_KHVATAET`); other scripts need `--name`. |
| `trove doc archive <doc> [--status closed]` | Move into the archive mirror, set the status, fix relative links on both sides. A status that `lifecycle` archives the type under, such as a closed plan's, is kept; `--status` sets one in the same step. |
| `trove doc retype <doc> <type>` | Turn a document into another type, e.g. research that became a plan of work: folder, prefix, status, title, links and references follow. |
| `trove summary new <kind> [filters] [--from latest\|DOC] [--keep] [--name]` | A dated summary document of that kind: its generated blocks filled, `<!-- write: … -->` places left for the analysis. `--from latest` keeps the template's structure and fills each write place with the text under the same `<!-- write: … -->` line in the last summary of the kind, else with what it has after the same heading or block. The summaries of the kind still in work go to the archive, each naming its successor in `superseded_by`; `--keep` leaves them. |
| `trove doc checked <doc>` · `trove doc set <doc> <field> <value>` | Re-checked today · any header field; `status` also updates the status line. |
| `trove item add <doc> column=value...` | A ledger row with the next free id and a section stub (`ledger.heading`, `ledger.stub`). Numbers of closed items are never reused. |
| `trove item close <id> [--as OUTCOME] [--commit SHA] [--archive]` | Drop the row and list other mentions. A type with `closeInto` moves the row and the section into its resolved companion; others mark the section closed in place. `--as` names the outcome (`fixed`, `dropped`, `moved`); `--archive` when it was the last open item. |
| `trove item defer <id>` | Status cell and section note to deferred. |
| `trove item move <id> <doc> [--archive]` | Move an item with its section to another ledger under the next id there; columns the target lacks are reported. A source with `closeInto` and a `moved` outcome keeps a row in its closed ledger that names the new id. |
| `trove item recheck [<id>...] [--drifted] [--unchanged] [field=value...]` | Set the item's own `checked` cell to the commit its code root is at now (short sha), or to today when it points into no root or several, so drift counts from there. `--drifted` takes every open item with `drift=true`, filters every matching one; `--unchanged` keeps only items whose code reads the same as at their check, whitespace and blank lines aside. The ledger needs a `checked` column; a table without one gets it. |
| `trove links [file] --fix` | Dead links into code point at the file's last version: the parent of the commit that deleted it, or, when the root's ref never had it, the last commit of another branch that does. A permalink when `origin` is on GitHub or GitLab (an SSH alias is resolved with `ssh -G`) and has the commit, otherwise a `*(deleted in abc1234)*` or `*(at abc1234)*` note after the link that `dead-link` checks at that commit. Links found in no branch stay and are listed. |
| `trove sync [-m TEXT]` | Commit hand edits together with rebuilt reports, then push by mode. Refuses while `check` is red. |

**Filters** work the same in `query`, `summary`, `export`, report configs, generated blocks and MCP tools: `field=value` matches the raw text or the vocabulary key (`status=open` and `status=открыто` are the same), `~text` a substring, `*` and `**` a glob, and `!` in front excludes. Items also filter on their document's fields: `owner=web path=!audits/mobile/**` is everything for the web team outside the mobile audits. Repeat a field or use commas for alternatives. Closed items are left out unless a filter names `state` (`state=closed`, `state=open,closed`).

**Drift.** `drift=true` finds items that may already be fixed: code they point at changed in its root after the item's own `checked` cell (a date or a commit, written by `item recheck`) or else its document's `checked` date, at the root's `ref` or else at `HEAD`. An item points at code through Markdown links in its ledger row and its own section, and through file names in inline code there, such as `` `send.ts:41` `` or `` `composer/send.ts` ``; a bare name counts only when exactly one file tracked in the code roots ends with it. A reference that names lines (`#L41-L63`, `:41-63`) drifts only when those lines changed: they are read as of the last commit on or before `checked`, so lines that merely moved do not count; when only other lines of that file changed, the item is `drift=file` instead, as the fix may sit elsewhere in the file. One without lines drifts on any change to the file or folder. `drift=false` means every reference was checked and is unchanged; `drift=unknown` means not all could be checked: the item points at no code, a root is missing on this machine, `checked` is neither a date nor a commit, or the root's `ref` is unknown here. A `drift` column in a generated block names the changed files and lines (a `file` one adds `(other lines)`), with `—` for unchanged and `?` for unknown. Drift cannot see a fix in code the item does not point at, behind pinned links (`*(at …)*`, `*(deleted in …)*`) or not yet committed. It takes one `git log` per root, plus one `git diff` per root and `checked` date for changed files referenced by lines, and runs only when a query, block or report names `drift`.

**Waiting.** An item (a `blocked_by` ledger column) or a document (a `blocked_by` header field) names the ids or documents it waits for; `waiting=true` holds while one of them is still open or in work, so a block can split what can start now from what waits. A deferral names what ends it in `until`; once all of it is done, `deferral-lifted` says so. Documents also take `owner` and give `note`, the text of their status line after the status word, as a column or `format` placeholder.

Commands find their store from the current folder: inside a store, then through the project's pointer, `.trove.yaml` or `.git/trove.yaml` (by `scope` when there are several), then through the registry, then a store next to the project whose `roots` name it. `--store <name|dir>` or `$TROVE_STORE` overrides.

**Sync.** `sync:` in `trove.yaml` decides what happens after an edit: `off` leaves git alone, `commit` makes one commit per operation (`docs: close WEB1-3`), `push` also pushes. When the remote moved on, trove rebases; conflicts in generated reports take the remote copy and are rebuilt, a conflict in a hand-written document stops with the file named and nothing pushed. Nothing is committed while `check` is red, nothing is ever force-pushed, and a store nested inside another repository never commits into it.

**Moving an archive.** A migrated store continues the archive's git history, so `migrate` sets no remote: pushing the store to the archive's `origin` would turn that repository into the store for everyone who still writes to the archive the old way. Instead it prints the archive's remote, a ready `trove remote add <url>` and how many archive commits that remote does not have yet; give the store a repository of its own, or reuse the old one only after sealing. While people still work in the archive, `trove resync` keeps the store in step, and `trove doctor` warns when the archive changed after the last resync. When the move is done, `trove resync --seal` brings the last changes, then writes `MOVED.md` into the archive, puts a line on top of its `AGENTS.md` (creating it if needed) saying where the store is and that the archive must not be written to, and commits both there when it is a git repository. It is the only command that writes into the archive.

## MCP

`trove mcp` serves the same operations to an assistant over stdio, for the stores of the folder it starts in. Twelve tools, each covering a family with a discriminator, keep the tool list cheap in every session:

| tool | does |
| ---- | ---- |
| `trove_query` · `trove_show` | rows of items or documents by filters, or with `kind: refs` what points at code, like `trove refs` · one item's section, `DOC#heading`, or an outline |
| `trove_summary` | a summary of a configured kind, or one built from filters, without writing it |
| `trove_check` · `trove_regulation` · `trove_prompt` | diagnostics · how this store works, generated from its config · a prompt's task text |
| `trove_create` · `trove_update` · `trove_transition` | new document from a template · a header field · archive with link fixes |
| `trove_item` | `add`, `close`, `defer`, `move`, `recheck` ledger items |
| `trove_report` · `trove_sync` | rebuild generated documents · commit hand edits and push |

Edits return the files they touched with line diffs; `dryRun: true` returns the diff without writing, and a refused edit lists the errors it would add. Resources: `trove://regulation/{topic}`, `trove://config`, `trove://template/{type}`.

### Assistants

| client | how |
| ------ | --- |
| Claude Code | `/plugin marketplace add MkSavin/trove`, then `/plugin install trove@trove-marketplace`: the MCP server, both skills, and hooks that run `check` on every edited document of a store and `sync` when a session ends. |
| Cursor | `trove client add cursor`: `.cursor/mcp.json` and `.cursor/skills/`. |
| Codex | `trove client add codex`: `[mcp_servers.trove]` in `.codex/config.toml` and `.agents/skills/`. |
| any | `trove client add claude` writes `.mcp.json` and `.claude/skills/` without the plugin; `trove init --client <name>` does it at creation. |
| this machine only | `trove client add claude --local` writes nothing into the project: the MCP server goes to this project's entry in `~/.claude.json` (what `claude mcp add --scope local` does) and the skills to `~/.claude/skills/`, both under `$CLAUDE_CONFIG_DIR` when it is set. Cursor and Codex keep MCP servers only in the project or for every project, so they refuse `--local`. |

The skills, `trove-store` and `trove-migrate`, live once in [`plugin/skills`](plugin/skills) and are bundled into the binary, so every client gets the same text.

## Concepts

**Project and store.** The project is your code repository. The store is a separate git repository of its documents, next to it by default. Access to a store is access to its repository.

By default trove leaves no trace in the project tree: the link lives in `.git/trove.yaml`, which git never shows or commits, and in `~/.trove/registry.yaml`; even without both, a store next to the project whose `roots` name it is found. Each teammate links their own clone with `trove clone <store-url>`. A team that wants the link in the repository uses `--share`, which writes `.trove.yaml` for a plain `trove clone`. Assistants follow the same rule: `trove client add claude --local` keeps their setup on this machine, and `trove init --client` does that unless the store is shared.

**Archive.** Working folders sit next to an archive folder (`.archive/` by default) that mirrors them.

**Document type.** A type is a set of capabilities, not hard-coded behaviour:

| capability | means |
| ---------- | ----- |
| `ledger` | carries `<!-- ledger -->` tables of open items, in the store's columns or the type's own `ledger:` |
| `status-line` | repeats status and checked date in a visible `**Status:**` line |
| `freshness` | goes stale when `checked` is older than the limit |
| `prompt-body` | the task text starts after `<!-- prompt -->` |
| `generated` | built by `trove report`, never edited by hand |
| `series`, `versions` | numbering (`_2`) and versions (`_V2`); used when creating documents |
| `resolved-of` | holds the closed items of the document in `base`: a ledger of the same columns plus their sections; `trove item close` moves them here |
| `stages` | its stages are whichever comes first outside generated blocks and code: a task list (`- [x] …`, nested items left out), a table with a status column, or two or more sibling headings or bold paragraph labels that start with stage codes of one kind (`### Э1. Catalog`, `**Stage 2.** …`). A coded stage is done by a `[x]` or `✅` mark, a done value in a trailing parenthesis (`(merged)`) or a status line right under it (`**Status:** done`). Titles lose their markup and keep the first sentence, up to about 80 characters. Read as the fields `progress` (`3/5`), `next` (the first stage not done) and `bar` (`3/5 ▰▰▰▱▱`); a document in the archive or with a status the archive keeps has none |

**What goes where.** Every type carries a `purpose`: what belongs in it and what does not. `trove regulation placement` prints them as one table, and a store's AGENTS.md can embed that table between `<!-- regulation:placement -->` and `<!-- /regulation:placement -->`; every report run rebuilds it, so the notes never drift from the config.

**Ledger.** Markdown tables inside ledger blocks; a document may hold several, and each item knows the heading it sits under (`section`). Columns are matched by header label, so tables with and without optional columns live side by side. A type with its own `ledger:` (ids, columns, statuses) keeps it apart from the audits, as a debt or risk register does. With `id: "DEBT-{section}{n}"` and `sections: { Server: S, Mobile: M }` each table numbers its own ids (`DEBT-S3`), and `trove item add DEBT section=Server …` adds to that table and places the item's section after the table's last one. `closed: { fixed: fixed, dropped: dropped }` names the ways an item gets closed, the first being the default; `note: "{status} {date}, {commit}"` marks a closed item's heading. `heading: "{id}. {what}"` and `stub:` (Markdown lines with the same placeholders) shape the section `item add` writes; a note in parentheses that trove did not write stays part of the title.

**Closed items.** A type with `closeInto: resolved` keeps its ledger for open work. `item close` moves the row into the closed-items ledger of the document's companion, `AUDIT_WEB_1.RESOLVED.md` next to it (same columns, the status holding the outcome), and the item's section below it with its heading marked. The companion is created on the first close with `base:` and a link back, keeps the audit's working notes as well, and is archived together with the audit.

**Generated blocks.** Any hand-written document can hold a block that trove keeps current:

```md
<!-- trove:items owner=backend status=open group=section columns=id,what -->
<!-- /trove:items -->
```

Views are `items`, `documents`, `progress` (documents with stages, finished ones left out: `3/5 ▰▰▰▱▱` and the next stage, e.g. `<!-- trove:progress type=plan place=work -->`), `counts` (`by=priority`), `placement`, `branches`, `changes` and `trend`; `as=table|list|ids`, `columns` (`document:audit` relabels one; a `drift` cell names the changed files), `label` (the first column of `counts`), `group`, `sort` and `format="{id} — {what}"` lay them out, every other option is a filter. A `filter:` header field adds to every block of the document. Every edit and report run refills the blocks; archived documents keep theirs as a snapshot, and so does a summary once its `date` has passed: it is a look at that day, and a new one is `trove summary new`. A rebase conflict inside a block settles itself.

Three views read git, once per run and only when a document holds them. `branches` lists the branches of a code root that match `pattern`, each once, newest first, with its own commits (those in none of the bases), the commits not in each base and the date of the last commit: `<!-- trove:branches root=app pattern=feature/* against=origin/develop,origin/main -->`. A branch that is both local and remote-tracking shows as the remote-tracking ref, unless the local one has commits the remote lacks: then it is the local branch, marked `local ahead N`, or, when both moved on, the remote one marked `local diverged`. Branches merged into every base are left out; `merged=true` shows only them, `merged=any` all; `active=30d` (or `6w`, `3m`) hides branches whose last commit is older. A root not checked out on this machine leaves the block as it is. `changes` lists the items closed, added and moved since a starting point, from the store's own history: `since=previous`, the default, is the commit that first added the previous summary of the same kind (the one this summary supersedes, even of the same day, else the latest dated before it, never a sibling of the same day), or its date when it was never committed; `since=<commit>` works too, and `since=<date>` is the last commit of the main line before that day, never an older commit of a branch merged later. An item moved to a document of another name, or closed as `moved`, counts as moved: `from` is where it was, `document` where it went and `to` its new id, which is then not listed as added. It is laid out like `items`, with a `change` column, and takes the same filters; `group=change` and `group=document` split it, `as=counts` counts the items per change, and with `by=document` (or another field) gives a row per document and a column per change. `trend` counts, week by week, the items opened, the items closed and those open at its end, from the ledgers' history: `<!-- trove:trend weeks=8 by=owner -->`. Weeks start on Monday, the last one is the current week, `weeks` defaults to 8; `by` gives a row per week and value of that field, and the item filters apply. An unknown root, base, span or starting point is a `live-block` error. The labels these views write (`branch`, `ownCommits`, `localAhead`, `changeClosed`, `week`, `trendOpened`, …) come in the store's `language` when its `labels` do not set them.

**Repeatable checks.** `verify:` says in words how to re-check a document; `verify-cmd:` says it as a shell command, such as `verify-cmd: git -C "{root:app}" grep -q presence.v2 -- api/presence/hub.go`. Exit code 0 means what the document says still holds: a plan's change is still in the code, a spec still matches it, an audit's finding is still there. Anything else means the document is out of date: re-check it, then fix the document or the command. `{root:<name>}` is the absolute path of that code root and `{store}` of the store, both with forward slashes; quote them when a path may hold spaces.

Nothing runs during a plain `trove check`. `trove check --verify` runs the commands of the documents in work, up to four at a time (`--jobs N`), each stopped after 60 seconds (`--timeout SECONDS`); it prints one line per document, with the end of a failing command's output, and exits 1 when one fails or times out. A document whose root is not checked out on this machine is skipped. Commands run in the store folder through Bun's shell, the same on Windows, macOS and Linux (`&&`, `|`, `$VAR`, `cd`, `echo` and `exit` are built in; `test` or `grep` must be installed, so `git grep` is the portable choice), with stdin closed and git hook variables removed. The last result per document is kept in `.trove/cache/verify.json`, and the `verified` column of `documents` blocks and `trove query documents` shows it, `ok 2026-10-16` or `failed 2026-10-16`, without running anything; it is empty when the command never ran on this machine or changed since.

**`--verify` runs shell commands written in the store's documents with your permissions.** Review changes to `verify-cmd` as you would code, and run it only on stores whose authors you trust.

**Report.** A query plus a layout. `BACKLOG.md` is the open items grouped by owner; a prompts index is the prompt documents sorted by path.

## Config

```yaml
regulation: 1
statuses: { open: open, closed: closed, archived: archived }

folders:
  audits: { prefix: AUDIT_, types: [audit] }

types:
  audit:
    capabilities: [ledger, status-line, freshness]
    fields: { slug: required }
  backlog:
    capabilities: [generated, status-line]

ledger:
  id: "{slug}-{n}"
  columns:
    - { key: id, label: id, required: true }
    - { key: status, label: status, required: true, enum: [open, deferred] }
    - { key: what, label: what is left, required: true }

lifecycle:
  audit:
    - { when: no-open-items, place: archive }

rules:
  unknown-field: off
  folder-type: { level: error, since: 2026-09-01 }   # older documents are exempt

reports:
  backlog:
    output: BACKLOG.md
    type: backlog
    status: open
    title: Backlog
    scope: all audits
    note: Generated from the audit ledgers.
    sections:
      - { from: items, where: { status: open }, groupBy: owner, sort: [id], columns: [id, what, document] }
```

`trove init` writes a complete config from the [English or Russian preset](src/core/presets). The schema lives in [`src/core/config/schema.ts`](src/core/config/schema.ts); its JSON Schema, [`schema/config.schema.json`](schema/config.schema.json), is generated from it (`bun run schema`), and new configs start with a `# yaml-language-server: $schema=…` line so editors complete and check them. Cross-references, such as a folder naming an unknown type, are reported before any document is read. `ignore` takes file names (`CONTRIBUTING.md`) and path globs (`notes/**`); `archive.finished` lists statuses a document may keep in the archive besides `archived`, such as `done` or `dropped`. `stages: { status: [status, статус], done: [done, merged, готово] }` names the status column of a stage table and the values that mean a stage is done (a value may go on, as in `merged 2026-10-01`); the defaults cover common English and Russian words (`done`, `merged`, `shipped`, `released`, `готово`, `влито`, `в master` and more) and `✓`, while `not done` or `не влито` stays not done. A type's `initial` sets the status of new documents, and `templates: <folder>` with a `<type>.md` inside replaces the built-in template (`{{name}}`, `{{title}}`, `{{status}}`, `{{date}}` and any header field; a field that was not given is left empty, and a placeholder that is not a field is refused).

### Summaries

A summary is a dated document of the `summary` type: generated blocks for the status, written paragraphs for the analysis. A kind fixes its title, base filter and template; `trove summary new weekly` creates `summaries/SUMMARY_WEEKLY_<date>.md` with every block filled and `<!-- write: … -->` places for the rest, which the `write-place` rule reports until text is written under them; the line stays, so the next summary finds the place by it. The previous weekly summary goes to the archive; `--from latest` carries its written analysis over, place by place, to be edited instead of written from scratch; blocks new to the template come in empty of text.

```yaml
summaries:
  web:
    title: Web client — what is left
    filter: { path: "!audits/mobile/**" }  # added to every block
    template: .trove/templates/web.md      # built-in layout when omitted
```

A template is the body after the status line: Markdown, generated blocks and write places; `{{title}}`, `{{date}}` and `{{kind}}` are filled in. `<!-- trove:changes -->` in it shows what was closed, added and moved since the previous summary of the kind.

## Rules

| rule | default | checks |
| ---- | ------- | ------ |
| `front-matter` | error | the document opens with a `---` block |
| `required-field` | error | required fields of the type are present |
| `field-format` | error | date fields hold a real `YYYY-MM-DD` |
| `unknown-field` | warn | only declared fields appear |
| `known-type` | error | the type is declared |
| `known-status` | error | the status is declared |
| `type-status` | error | the status is one the type allows |
| `archive-status` | error | archived status if and only if the file is in the archive folder; a status `lifecycle` sends to the archive, or one in `archive.finished`, counts as archived there |
| `lifecycle` | error | the document sits where `lifecycle` says it should |
| `status-line` | error | the status line matches the header |
| `ledger-block` | error | ledger types have one closed ledger block |
| `ledger-columns` | error | ledger headers use known columns and include the required ones |
| `ledger-row-shape` | error | every row has as many cells as its header |
| `id-hyphen` | error | ids use the ASCII hyphen, not U+2011 |
| `id-format` | error | ids follow `ledger.id` |
| `item-enum` | error | cells with a vocabulary hold one of its values |
| `duplicate-id` | error | ids are unique across the store |
| `wait-refs` | warn | `blocked_by` and `until` name items, documents or closed items that exist |
| `deferral-lifted` | warn | a deferral whose `until` is done |
| `item-size` | off | an item's section stays within `limit` bytes, 2048 by default: `item-size: { level: warn, limit: 2048, since: 2026-10-15 }` |
| `duplicate-suspect` | off | two open items look like one finding written twice: `limit` percent of the words of their `what` match (50 by default; case, punctuation and word endings aside, Russian and English alike), or half that when both name overlapping lines of one file; each pair is reported once, on the second item |
| `prompt-body` | error | prompts carry the `<!-- prompt -->` marker |
| `header-refs` | error | `refs` fields name existing documents |
| `folder-type` | warn | documents match their folder's types and prefixes |
| `dead-link` | warn | relative links reach a file in the store or in a code root checked out here |
| `live-block` | error | generated `<!-- trove:… -->` blocks are closed and name a known view with valid options |
| `live-block-stale` | warn | generated blocks match the store; edits inside them are overwritten by the next report |
| `write-place` | warn | places left for written analysis, `<!-- write: … -->`, are written up |
| `stale` | info | work documents are re-checked within the freshness limit |
| `stale-check` | off | an open item in work is re-checked within `limit` days, 30 by default, and with `commits` set before that many commits touch its code: `stale-check: { level: warn, limit: 30, commits: 5 }` |

Each rule can be turned `off` or given another level, `since` applies it only to documents dated on or after that day, and `limit` (and `commits` for `stale-check`) sets what a measuring rule measures against.

### Custom rules

Put scripts in the folder named by `plugins:` in the config. Each one exports `rules`:

```ts
import { defineRule } from "trove";

export const rules = [
  defineRule({
    id: "no-todo",
    level: "warn",
    summary: "No TODO left in documents.",
    scope: "document",
    check: (doc) => (doc.text.includes("TODO") ? [{ message: "TODO left" }] : []),
  }),
];
```

## Library

The CLI is a thin layer over the core. Everything it does is available as a library:

```ts
import { openStore, runRules, selectItems } from "trove";

const store = await openStore({ cwd: process.cwd() });
const errors = runRules(store.rules, store.index).filter((d) => d.severity === "error");
const urgent = selectItems(store.index, { priority: ["P0"], status: ["open"] });
```

## Development

```sh
bun install          # also installs the lefthook pre-commit hook
bun run verify       # biome + bun check (TypeScript 7) + bun test
bun run trove check --store sandbox
```

| path | what |
| ---- | ---- |
| [`sandbox/`](sandbox) | A green demo store for a made-up chat app: audits with ledgers and addenda, specs, plans, research, a study, an incident, prompts, two summaries, an archive. Use it to try commands; CI checks it and that its reports are current. |
| [`test/fixtures/broken/`](test/fixtures/broken) | A store with one planted error per rule, on the Russian preset. |

Both workflows also start by hand: **Actions → ci → Run workflow** on any branch, optionally on one OS, and **release → Run workflow** on `main`; a failed run has **Re-run failed jobs**.

`bun run e2e` drives the whole lifecycle through the CLI in a throwaway workspace: `init`, `doc new`, `item add`, `item close --archive`, `check`, `doctor`.

**Releases.** Every user-facing change adds a note with `bunx changeset`. On `main`, the release workflow turns pending notes into a `chore: release` PR; merging it bumps the version, writes `CHANGELOG.md` and tags the release. Opening that PR needs a `GH_BYPASS_TOKEN` secret with contents and pull-request write access when the repository forbids Actions to create pull requests.

## Roadmap

- [x] **Read core.** Parser that keeps the original text, config schema, index, rules, reports; `check`, `report`, `query`, `show`, `prompt`.
- [x] **Stores and edits.** `init`, `clone`, `migrate`, `store add`, per-machine registry, a private or shared pointer; `doc` and `item` edits that patch only their own lines.
- [x] **Sync.** Commit per operation, push with rebase and rebuilt reports, `trove sync` for hand edits, `trove remote add`.
- [x] **MCP.** One stdio server over the same operations, regulation generated from the config, several stores per project.
- [x] **Clients.** Agent skills, a Claude Code plugin with hooks, `client add` for Cursor and Codex, single-file binaries on every release.
- [x] **Migration.** Archives with their own statuses, ledger columns and conventions are fitted by `migrate`, and kept in step with `resync` while the move is under way.

## License

[MIT](LICENSE)
