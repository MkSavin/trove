import { relative, resolve, sep } from "node:path";
import type { Document } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { fencedLines } from "../markdown/fences.ts";
import type { Heading } from "../markdown/headings.ts";
import type { Link } from "../markdown/links.ts";
import { anchorRange, rangeText } from "../text/line-range.ts";
import { codeSpanRefs } from "./code-spans.ts";
import type { StoreIndex } from "./index.ts";
import { type CodeRef, codeRoot, linkTarget, rootKey } from "./links.ts";
import { itemHeading } from "./resolve.ts";

const inSection = (heading: Heading | undefined, offset: number): boolean =>
  heading !== undefined && offset >= heading.start && offset < heading.end;

const linkRef = (index: StoreIndex, doc: Document, link: Link): CodeRef[] => {
  const absolute = resolve(index.root, linkTarget(doc, link));
  const root = codeRoot(index, absolute);
  const path = root ? relative(root.dir, absolute).split(sep).join("/") : "";
  return root && path ? [{ root, path, lines: anchorRange(link.anchor) }] : [];
};

const sectionLines = (doc: Document, heading: Heading | undefined): string[] => {
  if (!heading) return [];
  const fenced = fencedLines(doc.lines);
  return doc.lines
    .filter((line) => inSection(heading, line.start) && !fenced.has(line.number))
    .map((line) => line.text);
};

export const refText = ({ path, lines }: CodeRef): string =>
  lines ? `${path}:${rangeText(lines)}` : path;

const unique = (refs: readonly CodeRef[]): CodeRef[] => [
  ...new Map(refs.map((ref) => [`${rootKey(ref.root)}\0${refText(ref)}`, ref])).values(),
];

/**
 * Code the item points at: links and file names in inline code, in its ledger row and its own
 * section. Pinned links point at a past commit on purpose, so they are left out.
 */
export const itemCodeRefs = (index: StoreIndex, doc: Document, item: Item): CodeRef[] => {
  const heading = itemHeading(doc, item.id);
  const links = doc.links
    .filter((link) => !link.pin && (link.line === item.line || inSection(heading, link.start)))
    .flatMap((link) => linkRef(index, doc, link));
  const texts = [...Object.values(item.values), ...sectionLines(doc, heading)];
  return unique([...links, ...codeSpanRefs(index, texts)]);
};

export const documentCodeRefs = (index: StoreIndex, doc: Document): CodeRef[] => {
  const links = doc.links.filter((link) => !link.pin).flatMap((link) => linkRef(index, doc, link));
  const fenced = fencedLines(doc.lines);
  const texts = doc.lines.filter((line) => !fenced.has(line.number)).map((line) => line.text);
  return unique([...links, ...codeSpanRefs(index, texts)]);
};
