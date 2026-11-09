# Comments

Default is no comment: a better name, a type or an extracted function first. A comment says only what the code cannot, in one or two lines of plain English. Never retell the code, explain an edit ("used to be X"), keep dead code or draw separators.

## Where it goes instead

| what you want to say | where |
| --- | --- |
| why this line must stay as it is | one line above it |
| a platform quirk | `.agents/workarounds/<slug>.md` + `@anchor WORKAROUND:<slug> <reason>` on the protected line |
| what a module guarantees | `.agents/<module>.md`, with a `Checked:` link to a test |
| a gap spanning several files | `.agents/todo.md` |
| something to drop later | `TODO` with its removal condition |

`@anchor` is the only reference from a comment to the docs, because a script checks it. The word tells a reader that the comment is load-bearing and must not be swept away.

## Anchors

| anchor | where | meaning |
| --- | --- | --- |
| `@anchor INV:<area>/<two-words>` | the line above `test(`, area = the test file's name | this test holds a claim in a document |
| `@anchor WORKAROUND:<slug> <reason>` | the protected line, in `src` or `scripts` | do not "clean" this up |
| `@anchor DOC:<path>` | JSDoc of a module's entry point | the prose for this module is `.agents/<path>.md` |

If a small function seems to need a `DOC` anchor, name it better. A test outlives the code it marks, so tests carry only `INV` anchors.

A claim in a document ends with `Checked: INV:<area>/<two-words>`. A claim no test can hold says `Not checked automatically: <reason>`. A bug left in on purpose gets the same note, since a test would only cement it.

## What `check-docs` enforces in `src` and `scripts`

- No non-English comments. Strings may hold any language.
- No references to specs, plans, tickets or `§`. Examples of store data belong in inline code.
- At most 3 line comments in a row and 10 lines in a block comment.
- No bare workaround or doc markers without `@anchor`, no unknown namespaces.

JSDoc follows the same rules: what the caller pays or gets when the signature does not say it, one line where possible.

## Docs

One paragraph per line, no manual wraps. Short: nouns and verbs. No history, no ticket numbers, no plan names: a document stands alone for someone who arrived with a symptom. Nothing about other projects: this repository is public, and examples are made up. `AGENTS.md` is at most 3 KB, any page here at most 8 KB. Past that, shorten or split by the questions readers ask.
