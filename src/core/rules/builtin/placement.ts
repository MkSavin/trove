import type { LifecycleStep } from "../../config/schema.ts";
import { archivedStatuses, labelOf } from "../../config/vocabulary.ts";
import type { Document } from "../../document/document.ts";
import { defineRule, type RuleContext } from "../rule.ts";

export const archiveStatus = defineRule({
  id: "archive-status",
  level: "error",
  summary: "Archived status and the archive folder go together.",
  scope: "document",
  check: (doc, { config }) => {
    const { folder, status, finished } = config.archive;
    const kept =
      doc.status !== undefined && archivedStatuses(config, doc.type).includes(doc.status);
    if (doc.place === "archive" && !kept) {
      return [{ line: 1, message: `in ${folder}/ but status is ${doc.meta.status ?? "missing"}` }];
    }
    // A status that lifecycle sends to the archive is reported by lifecycle while still in work.
    const archived = doc.status !== undefined && [status, ...finished].includes(doc.status);
    if (doc.place === "work" && archived) {
      const label = labelOf(config.statuses, doc.status ?? "");
      return [{ line: 1, message: `status ${label} outside ${folder}/` }];
    }
    return [];
  },
});

/** Why the step applies, or nothing when it does not. */
const reason = (step: LifecycleStep, doc: Document, ctx: RuleContext): string | undefined => {
  if (typeof step.when === "object") {
    return doc.status === step.when.status
      ? `status ${labelOf(ctx.config.statuses, step.when.status)}`
      : undefined;
  }
  if (!doc.ledger) return undefined;
  const open = doc.ledger.items.some((item) => item.open);
  if (step.when === "has-open-items") return open ? "has open items" : undefined;
  return open ? undefined : "no open items";
};

export const lifecycle = defineRule({
  id: "lifecycle",
  level: "error",
  summary: "Documents sit in the archive or the work folders as `lifecycle:` dictates.",
  scope: "document",
  check: (doc, ctx) => {
    const steps = doc.type === undefined ? [] : (ctx.config.lifecycle[doc.type] ?? []);
    const archive = ctx.config.archive.folder;
    return steps.flatMap((step) => {
      const why = step.place === doc.place ? undefined : reason(step, doc, ctx);
      if (!why) return [];
      const target = step.place === "archive" ? `move to ${archive}/` : `move out of ${archive}/`;
      const hint = step.place === "archive" ? `trove doc archive ${doc.name}` : undefined;
      return [{ line: 1, message: `${why}: ${target}`, hint }];
    });
  },
});
