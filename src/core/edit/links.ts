import { posix } from "node:path";
import type { Document } from "../document/document.ts";
import { type Patch, replace } from "./patch.ts";

export const resolveFrom = (rel: string, target: string): string =>
  posix.normalize(posix.join(posix.dirname(rel), target));

const linkFrom = (rel: string, target: string): string =>
  posix.relative(posix.dirname(rel), target) || posix.basename(target);

/** Links of a document that moves from `doc.rel` to `to`, rebased on its new folder. */
export const rebaseLinks = (doc: Document, to: string): Patch[] =>
  doc.links.flatMap((link) => {
    const rebased = linkFrom(to, resolveFrom(doc.rel, link.path));
    return rebased === link.path ? [] : [replace(link, rebased)];
  });

/** Links of another document that pointed at `from`, now pointing at `to`. */
export const retargetLinks = (doc: Document, from: string, to: string): Patch[] =>
  doc.links
    .filter((link) => resolveFrom(doc.rel, link.path) === from)
    .map((link) => replace(link, linkFrom(doc.rel, to)));
