import type { Config } from "../config/schema.ts";
import type { Document } from "../document/document.ts";

type ParsedConfig = { text: string; config: Config };

type ParsedDocuments = { config: Config; byRel: ReadonlyMap<string, Document> };

/** What a long-running process keeps between opens; parsed files are reused only while their text is the same. */
export type StoreCache = {
  roots: Map<string, string>;
  configs: Map<string, ParsedConfig>;
  documents: Map<string, ParsedDocuments>;
};

export const createStoreCache = (): StoreCache => ({
  roots: new Map(),
  configs: new Map(),
  documents: new Map(),
});

export const reusable = (
  cache: StoreCache | undefined,
  root: string,
  config: Config,
): ReadonlyMap<string, Document> | undefined => {
  const parsed = cache?.documents.get(root);
  return parsed?.config === config ? parsed.byRel : undefined;
};
