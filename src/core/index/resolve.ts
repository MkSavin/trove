import type { Document } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import type { Heading } from "../markdown/headings.ts";
import type { StoreIndex } from "./index.ts";

export type Resolved =
  | { kind: "item"; item: Item; document: Document; heading: Heading | undefined }
  | { kind: "section"; document: Document; heading: Heading }
  | { kind: "document"; document: Document };

export const findDocument = (index: StoreIndex, name: string): Document | undefined =>
  index.byName.get(name) ?? index.byName.get(`${name}.md`) ?? index.byRel.get(name);

/** Matches the id as a whole token: `WEB1-1` must not match `WEB1-10`. */
export const idToken = (id: string): RegExp =>
  new RegExp(`(?:^|[^\\w-])${RegExp.escape(id)}(?![\\w-])`);

export const itemHeading = (doc: Document, id: string): Heading | undefined => {
  const token = idToken(id);
  return doc.headings.find((heading) => token.test(heading.title));
};

const findHeading = (doc: Document, query: string): Heading | undefined => {
  const wanted = query.toLowerCase();
  return (
    doc.headings.find((heading) => heading.title.toLowerCase() === wanted) ??
    doc.headings.find((heading) => heading.title.toLowerCase().includes(wanted))
  );
};

/** Accepts an item id, `DOCUMENT#heading` or a document name. */
export const resolveRef = (index: StoreIndex, ref: string): Resolved | undefined => {
  const [name = "", query] = ref.split("#", 2);
  const document = findDocument(index, name);
  if (document && query !== undefined) {
    const heading = findHeading(document, query);
    return heading ? { kind: "section", document, heading } : undefined;
  }
  if (document) return { kind: "document", document };

  const item = index.items.find((candidate) => candidate.id === ref);
  const home = item ? index.byRel.get(item.document) : undefined;
  if (!item || !home) return undefined;
  return { kind: "item", item, document: home, heading: itemHeading(home, item.id) };
};

export const sectionText = (doc: Document, heading: Heading): string =>
  doc.text.slice(heading.start, heading.end).trimEnd();
