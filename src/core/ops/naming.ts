import { basename } from "node:path";
import type { Config } from "../config/schema.ts";
import { hasCapability } from "../config/vocabulary.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { transliterate } from "../text/transliterate.ts";

export type Placement = { folder: string | undefined; prefix: string };

const WORD = /[A-Z0-9]+/g;
const MAX_WORDS = 8;

/** `web client` → `WEB_CLIENT`, Cyrillic transliterated; other scripts need an explicit name. */
export const nameBase = (topic: string): string => {
  const base = (transliterate(topic).match(WORD) ?? []).slice(0, MAX_WORDS).join("_");
  if (!base) throw new TroveError(`cannot build a file name from "${topic}": pass --name`);
  return base;
};

const MD = /\.md$/i;

/** A given name gets the folder prefix unless it already starts with it; `.md` is dropped. */
export const prefixedStem = (prefix: string, name: string): string => {
  const stem = name.replace(MD, "");
  return stem.startsWith(prefix) ? stem : `${prefix}${stem}`;
};

/** The first folder that takes the type; its prefix at the type's position. */
export const placementOf = (config: Config, type: string): Placement => {
  const entry = Object.entries(config.folders).find(([, folder]) => folder.types.includes(type));
  if (!entry) return { folder: undefined, prefix: "" };
  const [folder, { prefix, types }] = entry;
  return { folder, prefix: prefix[types.indexOf(type)] ?? prefix[0] ?? "" };
};

const seriesNumber = (index: StoreIndex, stem: string): number => {
  const pattern = new RegExp(`^${RegExp.escape(stem)}_(\\d+)\\.md$`);
  const used = index.documents.flatMap((doc) => {
    const match = pattern.exec(basename(doc.rel));
    return match ? [Number(match[1])] : [];
  });
  return Math.max(0, ...used) + 1;
};

/** File name without extension; `series` types get the next `_N` across work and archive. */
export const documentName = (index: StoreIndex, type: string, stem: string): string => {
  const kind = index.config.types[type];
  const name = hasCapability(kind, "series") ? `${stem}_${seriesNumber(index, stem)}` : stem;
  if (index.byName.has(`${name}.md`)) throw new TroveError(`${name}.md already exists`);
  return name;
};
