import { basename } from "node:path";
import type { Config } from "../config/schema.ts";
import { hasCapability } from "../config/vocabulary.ts";
import type { Item } from "../document/ledger.ts";
import { splitRefs } from "../document/refs.ts";
import type { StoreIndex } from "../index/index.ts";
import { placeOf } from "../store/paths.ts";

/** Open where it stood: the items of a document in the archive count as closed. */
export const isLive = (item: Item | undefined, config: Config): item is Item =>
  item !== undefined && !item.closed && placeOf(item.document, config).place !== "archive";

/** A document that left its place, e.g. into the archive, is found again by its name. */
export const currentRel = (index: StoreIndex, rel: string): string =>
  index.byRel.has(rel) ? rel : (index.byName.get(basename(rel))?.rel ?? rel);

/** A `resolved-of` companion stands for the document its `base` names; others for themselves. */
export const baseRel = (index: StoreIndex, rel: string): string => {
  const doc = index.byRel.get(rel);
  if (!doc || !hasCapability(doc.typeConfig, "resolved-of")) return rel;
  const [name] = splitRefs(doc.meta.base ?? "");
  return (name && index.byName.get(name)?.rel) || rel;
};
