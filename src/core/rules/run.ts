import type { Document } from "../document/document.ts";
import type { StoreIndex } from "../index/index.ts";
import { compareDiagnostics, type Diagnostic } from "./diagnostic.ts";
import type { Rule, RuleContext, StoreFinding } from "./rule.ts";

const findingsOf = (
  rule: Rule,
  ctx: RuleContext,
  documents: readonly Document[],
): StoreFinding[] =>
  rule.scope === "store"
    ? [...rule.check(ctx)]
    : documents.flatMap((doc) =>
        rule.check(doc, ctx).map((finding) => ({ ...finding, file: doc.rel })),
      );

/** `since` exempts documents dated before it: old files are not rewritten for new rules. */
const isExempt = (doc: Document | undefined, since: string | undefined): boolean =>
  since !== undefined && doc !== undefined && (doc.meta.date ?? "") < since;

export const runRules = (rules: readonly Rule[], index: StoreIndex): Diagnostic[] => {
  const ctx: RuleContext = { index, config: index.config };
  const headed = index.documents.filter((doc) => doc.frontMatter);

  return rules
    .flatMap((rule) => {
      const setting = index.config.rules[rule.id];
      const severity = setting?.level ?? rule.level;
      if (severity === "off") return [];

      return findingsOf(rule, ctx, headed)
        .filter((finding) => !isExempt(index.byRel.get(finding.file), setting?.since))
        .map(
          ({ file, line, message, hint }): Diagnostic => ({
            rule: rule.id,
            severity,
            file,
            line,
            message,
            hint,
          }),
        );
    })
    .sort(compareDiagnostics);
};

export const unknownRuleIds = (rules: readonly Rule[], index: StoreIndex): string[] => {
  const known = new Set(rules.map((rule) => rule.id));
  return Object.keys(index.config.rules).filter((id) => !known.has(id));
};
