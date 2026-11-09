# Known gaps

Things known and not done. Close one by deleting it.

## verify: a child left behind is not tested

`collect` in `src/core/verify/shell.ts` stops reading shortly after the command exits, so a background child that keeps the pipe open cannot stall `check --verify`. No test starts such a child. Direction: a test with a detached child that writes after its parent exits, if it can be made stable on all three runners.

## release: the compiled binary never runs in tests

CI runs from source, so the `BUN_BE_BUN` path of `runShell` and the text-imported skills in a compiled build are exercised only by hand. Direction: a CI job that compiles one target and runs `check --verify` and `client add` with it.

## drift: no test uses a non-ASCII file name

`core.quotePath=false` protects code paths that parse git's output, and no fixture has a Cyrillic path to prove it. Direction: one code root with such a file in `test/extras.test.ts`.

## prompt: the clipboard has no test

`trove prompt --copy` shells out per platform, and no runner has a clipboard. Direction: leave as is unless the command starts failing; a test would only restate the command lines.
