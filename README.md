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
| `trove check [file] [--all] [--json]` | Run every rule; exits 1 on errors. `--all` also lists every document. |
| `trove query items status=open owner=web [--columns a,b]` | Filter items or documents by any field (see filters below). Items show the columns of the ledgers they come from, `id` first; `--columns` picks others. |
| `trove summary show [kind] [filters]` | A summary on screen, nothing written: a configured kind, or counts, open items by document and documents in work under the given filters. |
| `trove show WEB1-4` | Print one item's section, a closed one too; when no ledger holds the id, every section titled by it, archive included. Also takes `DOC#heading`, or a document name for its outline. |
| `trove prompt PROMPT_X [--copy]` | Print a prompt's task text, or copy it; Cyrillic survives on Windows too. |
| `trove report [name...]` · `trove rules` | Rebuild generated documents · list rules with their effective level. |
| `trove links [--dead]` | Relative links to documents and code; code is checked under `roots` present on this machine, in the checkout or, with `{ path, ref: origin/main }`, at that commit whatever branch is checked out; files git ignores there, such as installed packages, are read from the checkout. `--dead` ends with `N dead of M links`. |
| `trove export items [filters] --format csv\|json [--columns a,b]` | Rows for a CRM or a spreadsheet; RFC 4180 CSV. |

**Edit.** Every edit patches only its own lines, keeps CRLF, is checked in memory first and is not written if it adds an error. Generated reports are rebuilt in the same step; `--dry-run` prints the line diff instead.

| command | does |
| ------- | ---- |
| `trove doc new <type> <topic> [--scope] [--field k=v]` | A document from the type's template: folder, prefix, next series number, slug. The name is the topic's first eight words in capitals, Cyrillic transliterated (`чего не хватает` → `CHEGO_NE_KHVATAET`); other scripts need `--name`. |
| `trove doc archive <doc>` | Move into the archive mirror, set the status, fix relative links on both sides. |
| `trove doc retype <doc> <type>` | Turn a document into another type, e.g. research that became a plan of work: folder, prefix, status, title, links and references follow. |
| `trove summary new <kind> [filters] [--name]` | A dated summary document of that kind: its generated blocks filled, `<!-- write: … -->` places left for the analysis. |
| `trove doc checked <doc>` · `trove doc set <doc> <field> <value>` | Re-checked today · any header field; `status` also updates the status line. |
| `trove item add <doc> column=value...` | A ledger row with the next free id and a section stub (`ledger.heading`, `ledger.stub`). Numbers of closed items are never reused. |
| `trove item close <id> [--as OUTCOME] [--commit SHA] [--archive]` | Drop the row and list other mentions. A type with `closeInto` moves the row and the section into its resolved companion; others mark the section closed in place. `--as` names the outcome (`fixed`, `dropped`, `moved`); `--archive` when it was the last open item. |
| `trove item defer <id>` | Status cell and section note to deferred. |
| `trove item move <id> <doc> [--archive]` | Move an item with its section to another ledger under the next id there; columns the target lacks are reported. A source with `closeInto` and a `moved` outcome keeps a row in its closed ledger that names the new id. |
| `trove links [file] --fix` | Dead links into code point at the file's last version: the parent of the commit that deleted it, or, when the root's ref never had it, the last commit of another branch that does. A permalink when `origin` is on GitHub or GitLab (an SSH alias is resolved with `ssh -G`) and has the commit, otherwise a `*(deleted in abc1234)*` or `*(at abc1234)*` note after the link that `dead-link` checks at that commit. Links found in no branch stay and are listed. |
| `trove sync [-m TEXT]` | Commit hand edits together with rebuilt reports, then push by mode. Refuses while `check` is red. |

**Filters** work the same in `query`, `summary`, `export`, report configs, generated blocks and MCP tools: `field=value` matches the raw text or the vocabulary key (`status=open` and `status=открыто` are the same), `~text` a substring, `*` and `**` a glob, and `!` in front excludes. Items also filter on their document's fields: `owner=web path=!audits/mobile/**` is everything for the web team outside the mobile audits. Repeat a field or use commas for alternatives. Closed items are left out unless a filter names `state` (`state=closed`, `state=open,closed`).

Commands find their store from the current folder: inside a store, then through the project's pointer, `.trove.yaml` or `.git/trove.yaml` (by `scope` when there are several), then through the registry, then a store next to the project whose `roots` name it. `--store <name|dir>` or `$TROVE_STORE` overrides.

**Sync.** `sync:` in `trove.yaml` decides what happens after an edit: `off` leaves git alone, `commit` makes one commit per operation (`docs: close WEB1-3`), `push` also pushes. When the remote moved on, trove rebases; conflicts in generated reports take the remote copy and are rebuilt, a conflict in a hand-written document stops with the file named and nothing pushed. Nothing is committed while `check` is red, nothing is ever force-pushed, and a store nested inside another repository never commits into it.

**Moving an archive.** A migrated store continues the archive's git history, so `migrate` sets no remote: pushing the store to the archive's `origin` would turn that repository into the store for everyone who still writes to the archive the old way. Instead it prints the archive's remote, a ready `trove remote add <url>` and how many archive commits that remote does not have yet; give the store a repository of its own, or reuse the old one only after sealing. While people still work in the archive, `trove resync` keeps the store in step, and `trove doctor` warns when the archive changed after the last resync. When the move is done, `trove resync --seal` brings the last changes, then writes `MOVED.md` into the archive, puts a line on top of its `AGENTS.md` (creating it if needed) saying where the store is and that the archive must not be written to, and commits both there when it is a git repository. It is the only command that writes into the archive.

## MCP

`trove mcp` serves the same operations to an assistant over stdio, for the stores of the folder it starts in. Twelve tools, each covering a family with a discriminator, keep the tool list cheap in every session:

| tool | does |
| ---- | ---- |
| `trove_query` · `trove_show` | rows of items or documents by filters · one item's section, `DOC#heading`, or an outline |
| `trove_summary` | a summary of a configured kind, or one built from filters, without writing it |
| `trove_check` · `trove_regulation` · `trove_prompt` | diagnostics · how this store works, generated from its config · a prompt's task text |
| `trove_create` · `trove_update` · `trove_transition` | new document from a template · a header field · archive with link fixes |
| `trove_item` | `add`, `close`, `defer`, `move` ledger items |
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

**What goes where.** Every type carries a `purpose`: what belongs in it and what does not. `trove regulation placement` prints them as one table, and a store's AGENTS.md can embed that table between `<!-- regulation:placement -->` and `<!-- /regulation:placement -->`; every report run rebuilds it, so the notes never drift from the config.

**Ledger.** Markdown tables inside ledger blocks; a document may hold several, and each item knows the heading it sits under (`section`). Columns are matched by header label, so tables with and without optional columns live side by side. A type with its own `ledger:` (ids, columns, statuses) keeps it apart from the audits, as a debt or risk register does. With `id: "DEBT-{section}{n}"` and `sections: { Server: S, Mobile: M }` each table numbers its own ids (`DEBT-S3`), and `trove item add DEBT section=Server …` adds to that table and places the item's section after the table's last one. `closed: { fixed: fixed, dropped: dropped }` names the ways an item gets closed, the first being the default; `note: "{status} {date}, {commit}"` marks a closed item's heading. `heading: "{id}. {what}"` and `stub:` (Markdown lines with the same placeholders) shape the section `item add` writes; a note in parentheses that trove did not write stays part of the title.

**Closed items.** A type with `closeInto: resolved` keeps its ledger for open work. `item close` moves the row into the closed-items ledger of the document's companion, `AUDIT_WEB_1.RESOLVED.md` next to it (same columns, the status holding the outcome), and the item's section below it with its heading marked. The companion is created on the first close with `base:` and a link back, keeps the audit's working notes as well, and is archived together with the audit.

**Generated blocks.** Any hand-written document can hold a block that trove keeps current:

```md
<!-- trove:items owner=backend status=open group=section columns=id,what -->
<!-- /trove:items -->
```

Views are `items`, `documents`, `counts` (`by=priority`) and `placement`; `as=table|list|ids`, `columns` (`document:audit` relabels one), `label` (the first column of `counts`), `group`, `sort` and `format="{id} — {what}"` lay them out, every other option is a filter. A `filter:` header field adds to every block of the document. Every edit and report run refills the blocks; archived documents keep theirs as a snapshot, and so does a summary once its `date` has passed: it is a look at that day, and a new one is `trove summary new`. A rebase conflict inside a block settles itself.

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

`trove init` writes a complete config from the [English or Russian preset](src/core/presets). The schema lives in [`src/core/config/schema.ts`](src/core/config/schema.ts); cross-references, such as a folder naming an unknown type, are reported before any document is read. `ignore` takes file names (`CONTRIBUTING.md`) and path globs (`notes/**`); `archive.finished` lists statuses a document may keep in the archive besides `archived`, such as `done` or `dropped`. A type's `initial` sets the status of new documents, and `templates: <folder>` with a `<type>.md` inside replaces the built-in template (`{{name}}`, `{{title}}`, `{{status}}`, `{{date}}` and any header field; a field that was not given is left empty, and a placeholder that is not a field is refused).

### Summaries

A summary is a dated document of the `summary` type: generated blocks for the status, written paragraphs for the analysis. A kind fixes its title, base filter and template; `trove summary new weekly` creates `summaries/SUMMARY_WEEKLY_<date>.md` with every block filled and `<!-- write: … -->` places for the rest, which the `write-place` rule reports until they are written up.

```yaml
summaries:
  web:
    title: Web client — what is left
    filter: { path: "!audits/mobile/**" }  # added to every block
    template: .trove/templates/web.md      # built-in layout when omitted
```

A template is the body after the status line: Markdown, generated blocks and write places; `{{title}}`, `{{date}}` and `{{kind}}` are filled in.

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
| `archive-status` | error | archived status if and only if the file is in the archive folder |
| `lifecycle` | error | the document sits where `lifecycle` says it should |
| `status-line` | error | the status line matches the header |
| `ledger-block` | error | ledger types have one closed ledger block |
| `ledger-columns` | error | ledger headers use known columns and include the required ones |
| `ledger-row-shape` | error | every row has as many cells as its header |
| `id-hyphen` | error | ids use the ASCII hyphen, not U+2011 |
| `id-format` | error | ids follow `ledger.id` |
| `item-enum` | error | cells with a vocabulary hold one of its values |
| `duplicate-id` | error | ids are unique across the store |
| `item-size` | off | an item's section stays within `limit` bytes, 2048 by default: `item-size: { level: warn, limit: 2048, since: 2026-10-15 }` |
| `prompt-body` | error | prompts carry the `<!-- prompt -->` marker |
| `header-refs` | error | `refs` fields name existing documents |
| `folder-type` | warn | documents match their folder's types and prefixes |
| `dead-link` | warn | relative links reach a file in the store or in a code root checked out here |
| `live-block` | error | generated `<!-- trove:… -->` blocks are closed and name a known view with valid options |
| `live-block-stale` | warn | generated blocks match the store; edits inside them are overwritten by the next report |
| `write-place` | warn | places left for written analysis, `<!-- write: … -->`, are written up |
| `stale` | info | work documents are re-checked within the freshness limit |

Each rule can be turned `off` or given another level, `since` applies it only to documents dated on or after that day, and `limit` sets what a measuring rule measures against.

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
