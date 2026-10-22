import { posix } from "node:path";
import type { Document } from "../document/document.ts";
import { findLinks } from "../markdown/links.ts";
import { splitLines } from "../text/lines.ts";
import { applyPatches, type Patch, replace } from "./patch.ts";

export const resolveFrom = (rel: string, target: string): string =>
  posix.normalize(posix.join(posix.dirname(rel), target));

const linkIn = (dir: string, target: string): string =>
  posix.relative(dir, target) || posix.basename(target);

export const linkFrom = (rel: string, target: string): string => linkIn(posix.dirname(rel), target);

/** Text copied from a document in `fromDir` into one in `toDir`, its relative links still working. */
export const rebaseText = (text: string, fromDir: string, toDir: string): string =>
  fromDir === toDir || !text.includes("](")
    ? text
    : applyPatches(
        text,
        findLinks(splitLines(text), new Set()).map((link) =>
          replace(link, linkIn(toDir, posix.normalize(posix.join(fromDir, link.path)))),
        ),
      );

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
