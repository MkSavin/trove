# CLI and dashboard

A thin layer over the core: argument parsing, printing and exit codes. The read-only dashboard is here too. Code: `src/cli`, `src/serve`.

```
main.ts → run(argv, io)
 └─ COMMANDS.find(name).run(rest, io)   src/cli/commands/<name>.ts
     ├─ openFromFlags                   --store, --config
     └─ runPlan                         edits: applyPlan, printOutcome, syncOutcome

trove serve → serveStore({ port, open })
 └─ one index per request → route → page
```

## Commands

A `Command` is `{ name, summary, usage, run }`, listed in `COMMANDS` in `run.ts`. `Io` carries output and prompts, so tests capture them with `captureIo`. Domain logic belongs in `src/core`; the MCP server and the library use the same functions.

`--dry-run` on an edit prints line diffs and writes nothing. `--help` on any command prints its usage without running it.

## Exit codes

`0` ok, `1` the command ran and found something wrong (`check` errors, a refused edit), `2` usage or a `TroveError`.

## Dashboard

`serveStore` binds `127.0.0.1` and opens the store on every request, so pages show the files as they are. It answers only GET and HEAD, and only for a `Host` of its own: another `Host` means a foreign site reached the port through its own domain name. Markdown is rendered through a small allow-list and everything else is escaped. Pages carry a strict content security policy.

## Invariants

- **Writes, foreign hosts and bad filters get errors, nothing else.** Checked: INV:serve/foreign-hosts.

## Errors

`run` prints a `TroveError` as `trove <name>: <message>` and returns 2; any other exception is a bug and surfaces as a stack trace. The dashboard shows a `TroveError` or a malformed URL as a 400 page.
