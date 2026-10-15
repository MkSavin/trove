import { join } from "node:path";
import type { Config } from "../config/schema.ts";
import type { StoreIndex } from "../index/index.ts";
import { fillLiveBlocks } from "../live/fill.ts";
import { placementTable } from "../regulation/regulation.ts";
import type { PlannedReport } from "./write.ts";

/** Tables built from the config that a hand-written file may embed between two markers. */
const EMBEDS: Readonly<Record<string, (config: Config) => string>> = {
  placement: placementTable,
};

const BLOCK = /^(<!--\s*regulation:([\w-]+)\s*-->)(\r?\n)[\s\S]*?^(<!--\s*\/regulation:\2\s*-->)/gm;
const LIVE = /^<!--\s*trove:[\w-]+/m;

/** Refills every known `<!-- regulation:<name> -->` block; unknown names stay untouched. */
export const fillEmbeds = (text: string, config: Config): string =>
  text.replace(BLOCK, (whole, open: string, name: string, eol: string, close: string) => {
    const build = EMBEDS[name];
    if (!build) return whole;
    return `${open}${eol}${build(config).replaceAll("\n", eol)}${eol}${close}`;
  });

/** Hand-written text with its generated blocks rebuilt; the rest is left byte for byte. */
export const refreshGenerated = (text: string, rel: string, index: StoreIndex): string =>
  fillLiveBlocks(fillEmbeds(text, index.config), rel, index).text;

const hasBlocks = (text: string): boolean => text.search(BLOCK) >= 0 || LIVE.test(text);

const plan = (output: string, previous: string, index: StoreIndex): PlannedReport | undefined => {
  if (!hasBlocks(previous)) return undefined;
  const text = refreshGenerated(previous, output, index);
  return { name: `blocks in ${output}`, output, rows: 0, changed: text !== previous, text };
};

/** Files whose generated blocks are out of date; archived documents keep theirs as a snapshot. */
export const planEmbeds = async (index: StoreIndex): Promise<PlannedReport[]> => {
  const outside = index.config.regulationFiles.filter((rel) => !index.byRel.has(rel));
  const files = await Promise.all(
    outside.map(async (rel) => {
      const file = Bun.file(join(index.root, rel));
      return (await file.exists()) ? plan(rel, await file.text(), index) : undefined;
    }),
  );
  const documents = index.documents
    .filter((doc) => doc.place === "work")
    .map((doc) => plan(doc.rel, doc.text, index));
  return [...files, ...documents].filter((entry): entry is PlannedReport => entry !== undefined);
};
