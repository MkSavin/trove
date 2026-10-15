import { join } from "node:path";
import type { Config } from "../config/schema.ts";
import { type Document, parseDocument } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { listDocuments } from "../store/walk.ts";
import { today } from "../text/dates.ts";

export type StoreIndex = {
  root: string;
  config: Config;
  /** The date freshness is measured against. */
  today: string;
  documents: readonly Document[];
  items: readonly Item[];
  byName: ReadonlyMap<string, Document>;
  byRel: ReadonlyMap<string, Document>;
};

export const indexDocuments = (
  root: string,
  config: Config,
  documents: readonly Document[],
  now: string = today(),
): StoreIndex => ({
  root,
  config,
  today: now,
  documents,
  items: documents.flatMap((doc) => doc.ledger?.items ?? []),
  byName: new Map(documents.map((doc) => [doc.name, doc])),
  byRel: new Map(documents.map((doc) => [doc.rel, doc])),
});

export const buildIndex = async (
  root: string,
  config: Config,
  now?: string,
): Promise<StoreIndex> => {
  const rels = await listDocuments(root, config);
  const documents = await Promise.all(
    rels.map(async (rel) => {
      const path = join(root, rel);
      return parseDocument({ path, rel, text: await Bun.file(path).text() }, config);
    }),
  );
  return indexDocuments(root, config, documents, now);
};
