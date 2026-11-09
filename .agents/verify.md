# Repeatable checks

Runs the shell command a document carries in `verify-cmd`, which says whether what it describes still holds. Only `trove check --verify` runs them. Code: `src/core/verify`.

```
verifyDocuments(index, { only, jobs, timeoutMs })
 ├─ verifyCommandOf         documents in work with a command
 ├─ expandCommand           {store}, {root:name} → absolute forward-slash paths
 ├─ mapLimit → runShell     bun exec, up to 4 at a time, 60 s each
 └─ writeVerifications      .trove/cache/verify.json
```

## Running

`runShell` goes through Bun's own shell, so a command behaves the same on every OS: `&&`, `|`, `$VAR`, `cd`, `echo` and `exit` are built in. It runs in the store folder, stdin closed, git hook variables removed. Commands come from the store's documents and run with the user's permissions.

## Outcomes

`ok` is exit 0. `failed` is any other exit, or a `{root:x}` not listed in `roots`. `timed-out` kills the command at the limit. `skipped` means the root is listed but not on this machine; it is not a failure and is not recorded.

The cache keeps the last result per document, with its command. The `verified` column reads it without running anything, and shows nothing when the command changed since.

## Invariants

- **A command runs with stdin closed and without git hook variables.** Checked: INV:verify/closed-stdin.
- **Paths reach the shell with forward slashes.** Checked: INV:verify/forward-slashes.
- **A command is stopped at the timeout.** Checked: INV:verify/stops-timeout.

## Errors

A failing command is a result, not an exception; `check --verify` exits 1 when one fails or times out. A timeout or job count that is not a whole number is a `TroveError`.
