import { join } from "node:path";
import type { Config } from "../config/schema.ts";
import { type Document, parseDocument } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import type { GitData } from "../live/git-data.ts";
import { listDocuments } from "../store/walk.ts";
import { today } from "../text/dates.ts";
import { readVerifications, type Verification } from "../verify/cache.ts";

export type StoreIndex = {
  root: string;
  config: Config;
  /** The date freshness is measured against. */
  today: string;
  documents: readonly Document[];
  items: readonly Item[];
  byName: ReadonlyMap<string, Document>;
  byRel: ReadonlyMap<string, Document>;
  /** Read by `withStoreGitData`; blocks that need it are left as they are without it. */
  gitData?: GitData | undefined;
  /** The last `trove check --verify` result per document on this machine. */
  verified: ReadonlyMap<string, Verification>;
};

export const indexDocuments = (
  root: string,
  config: Config,
  documents: readonly Document[],
  now: string = today(),
  verified: ReadonlyMap<string, Verification> = new Map(),
): StoreIndex => ({
  root,
  config,
  today: now,
  documents,
  items: documents.flatMap((doc) => doc.ledger?.items ?? []),
  byName: new Map(documents.map((doc) => [doc.name, doc])),
  byRel: new Map(documents.map((doc) => [doc.rel, doc])),
  verified,
});

/** `parsed` holds documents read earlier with the same config: one whose text is unchanged is reused. */
export const buildIndex = async (
  root: string,
  config: Config,
  now?: string,
  parsed?: ReadonlyMap<string, Document>,
): Promise<StoreIndex> => {
  const rels = await listDocuments(root, config);
  const documents = await Promise.all(
    rels.map(async (rel) => {
      const path = join(root, rel);
      const text = await Bun.file(path).text();
      const known = parsed?.get(rel);
      return known?.text === text ? known : parseDocument({ path, rel, text }, config);
    }),
  );
  return indexDocuments(root, config, documents, now, await readVerifications(root));
};
