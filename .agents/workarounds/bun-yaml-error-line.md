---
anchor: WORKAROUND:bun-yaml-error-line
rule: Never report the line of a Bun.YAML error; parse field by field when the line matters.
---

**Symptom.** A config with a syntax error is reported at a line that has nothing to do with it, and the same line comes back for every input.

**Mechanics.** In Bun 1.4 the `SyntaxError` from `Bun.YAML.parse` says only `YAML Parse error: Unexpected token`, and its `line` and `column` are the position of the JavaScript call, not of the YAML.

**Fix.** `readYaml` names the file and no line. `front-matter-yaml` needs the field, so it parses each top-level line alone and reports the ones that fail.

Checked: INV:config/yaml-origin, INV:rules/yaml-field.
