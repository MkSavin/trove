# Rules and check

One function runs every rule over an index and returns diagnostics. `trove check`, every edit, sync and the assistant hooks all use it. Code: `src/core/rules`, `src/cli/commands/check.ts`.

```
runRules(rules, index) → Diagnostic[]
 ├─ rule level: config `rules:` over the rule's own default; `off` skips it
 ├─ document rule: once per document with a front matter
 ├─ store rule: once, across documents
 └─ `since`: drops findings in documents dated before it
```

## What a rule is

`defineRule({ id, level, summary, scope, check })`. `check` is synchronous and pure over the index: it returns findings, it does not read or write. A rule that needs git reads what the index already holds or uses `gitSync` behind a per-index cache.

Severity comes from the config, so a finding has no severity of its own. `error` blocks edits and commits, `warn` and `info` do not.

## Adding a rule

1. A file in `src/core/rules/builtin`, exported through `builtin/index.ts`.
2. A row in the rules table of `README.md` and `README.ru.md` with its id and default level; a test compares them.
3. A planted error in `test/fixtures/broken` and its expected line in `test/rules.test.ts`, unless the rule is `off` by default.

A store adds its own in the folder named by `plugins:`: every `*.ts` or `*.js` there exports `rules`. An id that clashes with a built-in one is an error.

## Check

`trove check [file]` runs every rule and exits 1 on errors. An id under `rules:` that no rule has is a warning, reported against the config file. `--verify` is separate (see `verify.md`) and adds its failures to the exit code.

## Invariants

- **The fixture store reports exactly its planted errors.** Each rule has one, on the Russian preset. Checked: INV:rules/planted-errors.
- **`front-matter-yaml` points at the field to quote.** Each field is parsed alone, because the parser's own error has no usable line. Checked: INV:rules/yaml-field.

## Errors

A rule does not throw on a bad document: it reports. A plugin that does not export `rules: Rule[]`, or a `plugins:` folder that does not exist, is a `TroveError` when the store opens.
