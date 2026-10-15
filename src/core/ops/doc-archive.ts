import { labelOf } from "../config/vocabulary.ts";
import { type Document, stemOf } from "../document/document.ts";
import { setField } from "../edit/front-matter.ts";
import { rebaseLinks, retargetLinks } from "../edit/links.ts";
import { applyPatches } from "../edit/patch.ts";
import { setStatusLine } from "../edit/status-line.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import type { Change, Plan } from "./plan.ts";

/** Moves the document into the archive mirror and fixes relative links on both sides. */
export const archivePlan = (index: StoreIndex, doc: Document): Plan => {
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
