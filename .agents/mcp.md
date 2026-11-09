# MCP and clients

The same operations for an assistant over stdio, and the setup that connects each assistant to them. Code: `src/mcp`, `src/clients`, `plugin/`.

```
trove mcp → serveStdio → createServer(context)
 ├─ registerReadTools          query, show, summary, check, regulation, prompt
 ├─ registerEditTools          create, update, transition, item
 ├─ registerMaintenanceTools   report, sync
 └─ registerResources          trove://regulation/{topic}, config, template/{type}

trove client add <name> [--local]
 ├─ installClient              LAYOUTS[name]: an MCP file and a skills folder
 └─ installLocal               this machine only, for clients with a per-user config
```

## Server

Every tool opens the store through `openFor`, with the server's working folder and a shared `StoreCache`. Each call sees the disk as it is now; only unchanged files are reused.

The tool list is short on purpose: a family of actions is one tool with a discriminator, such as `kind` or `action`, because the list costs tokens in every session. A new action goes into an existing tool unless it fits none.

`guarded` turns a `TroveError` into a tool error the model can read; anything else stays an exception. Edits go through `runPlanTool`: the files with line diffs, notes, sync result and, on refusal, the errors. `trove_query` returns 100 rows unless `limit` says otherwise and notes how to read on.

Over stdio the server's stdin carries the protocol, so no child process may inherit it; see `workarounds/child-stdin-closed.md`.

`addStoreNotices` wraps every tool registered after it: when the store syncs and has uncommitted files, the result gets one more text block saying so. Read-only tools reuse the git status for 10 seconds, a tool that may write asks again. The notice never costs a tool its answer: any failure means no notice.

## Clients

A client is a row in `LAYOUTS`: where its MCP servers are registered and where its skills live. JSON configs are merged with other servers kept; TOML gets one table appended. A broken existing config is refused, never overwritten.

`--local` writes nothing into the project: a client with a user-level config has a row in `LOCAL_INSTALLERS`, any other refuses it. Claude Code keys servers per project there; Kimi Code's user level reaches every project. `replaceFile` writes through a temporary file, because that program may read the config at any moment. Kimi Code's hooks are appended to its `config.toml` and every existing byte stays, because that file holds credentials.

Skills live once in `plugin/skills` and are bundled into the binary as text, so every client gets the same words. The Claude Code plugin in `plugin/` must match what `trove client add` installs; a test compares them.

## Hooks

`trove hook post-edit` reads the assistant's JSON from stdin (`src/clients/hooks.ts`): after an edit to a store's document it returns errors to the model with exit 2, and says the same way that a generated report will be overwritten. `trove hook stop` commits hand edits when the store syncs and is green. Outside a store both stay quiet. A crash in a hook exits 1, never 2: at Stop, exit 2 would keep the assistant running forever.

## Invariants

- **The tool set is small and stable.** Checked: INV:mcp/tool-set.
- **The stdio server answers.** Checked: INV:mcp/stdio-server.
- **A refused edit writes nothing and says why.** Checked: INV:mcp/refused-edit.
- **A failing status read never fails the tool.** Checked: INV:notice/git-failure.
- **Claude Code project keys use forward slashes.** Checked: INV:clients/forward-keys.

## Errors

A `TroveError` comes back with `isError: true`. A refused edit is a normal result with `written: false`, since the model acts on its errors.
