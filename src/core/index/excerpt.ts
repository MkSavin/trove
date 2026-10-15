import type { Document } from "../document/document.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "./index.ts";
import { type Resolved, resolveRef, sectionsTitled, sectionText } from "./resolve.ts";

export type Excerpt = { file: string; line: number; text: string };

const outline = (doc: Document): string =>
  doc.headings
    .map((heading) => `${"  ".repeat(heading.level - 1)}${heading.title}  :${heading.line}`)
    .join("\n");

const toExcerpt = (resolved: Resolved): Excerpt => {
  const { document } = resolved;
  const heading = resolved.kind === "document" ? undefined : resolved.heading;
  if (heading)
    return { file: document.rel, line: heading.line, text: sectionText(document, heading) };
  if (resolved.kind === "item") {
    const { line } = resolved.item;
    return { file: document.rel, line, text: document.lines[line - 1]?.text ?? "" };
  }
  return { file: document.rel, line: 1, text: outline(document) };
};

/**
 * An item's section (its ledger row when it has none), a `DOC#heading` section, or an outline;
 * else every section whose heading starts with the id, as closed items are written up.
 */
export const excerpts = (index: StoreIndex, ref: string): Excerpt[] => {
  const resolved = resolveRef(index, ref);
  const found = resolved ? [resolved] : sectionsTitled(index, ref);
  if (found.length === 0) throw new TroveError(`nothing matches ${ref}`);
  return found.map(toExcerpt);
};

export const formatExcerpts = (found: readonly Excerpt[]): string =>
  found.map(({ file, line, text }) => `${file}:${line}\n\n${text}`).join("\n\n");
