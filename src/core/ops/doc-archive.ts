import { labelOf } from "../config/vocabulary.ts";
import { type Document, stemOf } from "../document/document.ts";
import { setField } from "../edit/front-matter.ts";
import { rebaseLinks, retargetLinks } from "../edit/links.ts";
import { applyPatches } from "../edit/patch.ts";
import { setStatusLine } from "../edit/status-line.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import type { Change, Plan } from "./plan.ts";
import { companionOf } from "./resolved.ts";
import { thenPlan } from "./with-changes.ts";

/** Moves the document into the archive mirror and fixes relative links on both sides. */
const archiveOne = (index: StoreIndex, doc: Document): Plan => {
  if (doc.place === "archive") throw new TroveError(`${doc.rel} is already archived`);
  const { folder, status } = index.config.archive;
  const target = `${folder}/${doc.rel}`;
  const label = labelOf(index.config.statuses, status);

  const moved = applyPatches(doc.text, [
    setField(doc, "status", label),
    ...setStatusLine(doc, { status: label }),
    ...rebaseLinks(doc, target),
  ]);
  const linking = index.documents.flatMap((other): Change[] => {
    const patches = other.rel === doc.rel ? [] : retargetLinks(other, doc.rel, target);
    return patches.length > 0 ? [{ rel: other.rel, text: applyPatches(other.text, patches) }] : [];
  });

  return {
    changes: [{ rel: target, text: moved, from: doc.rel }, ...linking],
    notes: [`${doc.rel} → ${target}`],
    message: `docs: archive ${stemOf(doc)}`,
  };
};

/** The document and its `resolved-of` companion go together. */
export const archivePlan = (index: StoreIndex, doc: Document): Plan => {
  const plan = archiveOne(index, doc);
  const companion = companionOf(index, doc);
  if (!companion || companion.place === "archive") return plan;
  return {
    ...thenPlan(index, plan, (after) => {
      const moved = after.byRel.get(companion.rel);
      if (!moved) throw new TroveError(`${companion.rel} is gone`);
      return archiveOne(after, moved);
    }),
    message: plan.message,
  };
};
