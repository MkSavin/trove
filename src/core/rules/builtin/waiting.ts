import type { Document } from "../../document/document.ts";
import type { StoreIndex } from "../../index/index.ts";
import { pendingRefs, refsOf, unknownRefs } from "../../index/waiting.ts";
import { defineRule, type Finding } from "../rule.ts";

const DEFERRED = "deferred";
const FIELDS = ["blocked_by", "until"] as const;

/** `until` of each deferred item, and of the document itself while it is in work. */
const deferrals = (doc: Document): { line: number; label: string; until: string }[] => [
  ...(doc.ledger?.items ?? [])
    .filter((item) => item.status === DEFERRED && item.values.until)
    .map((item) => ({ line: item.line, label: item.id, until: item.values.until ?? "" })),
  ...(doc.place === "work" && doc.meta.until
    ? [{ line: 1, label: doc.name, until: doc.meta.until }]
    : []),
];

export const deferralLifted = defineRule({
  id: "deferral-lifted",
  level: "warn",
  summary: "A deferral whose `until` is done: everything it waited for is closed or archived.",
  scope: "document",
  check: (doc, { index }) =>
    deferrals(doc)
      .filter(({ until }) => pendingRefs(index, until).length === 0)
      .map(({ line, label, until }) => ({
        line,
        message: `${label} waited until ${refsOf(until).join(", ")}, which is done: take it up again`,
      })),
});

const refFindings = (index: StoreIndex, line: number, label: string, value: string) =>
  unknownRefs(index, value).map((ref) => ({
    line,
    message: `${label} waits for ${ref}, which names nothing`,
  }));

export const waitRefs = defineRule({
  id: "wait-refs",
  level: "warn",
  summary: "`blocked_by` and `until` name items, documents or closed items that exist.",
  scope: "document",
  check: (doc, { index }) =>
    FIELDS.flatMap((field): Finding[] => [
      ...(doc.meta[field] ? refFindings(index, 1, doc.name, doc.meta[field] ?? "") : []),
      ...(doc.ledger?.items ?? []).flatMap((item) =>
        item.values[field] ? refFindings(index, item.line, item.id, item.values[field] ?? "") : [],
      ),
    ]),
});
