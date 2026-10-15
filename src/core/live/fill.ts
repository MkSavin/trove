import { eolOf } from "../edit/patch.ts";
import { parseFilterText } from "../index/filters.ts";
import type { StoreIndex } from "../index/index.ts";
import { parseFrontMatter } from "../markdown/front-matter.ts";
import { splitLines } from "../text/lines.ts";
import { findLiveBlocks, type LiveBlock } from "./blocks.ts";
import { renderView } from "./views.ts";

export type BlockProblem = { block: LiveBlock; message: string };

/** The `filter:` header field: what every block of the document inherits. */
const baseFilters = (text: string) =>
  parseFilterText(parseFrontMatter(splitLines(text))?.fields.get("filter")?.value);

/**
 * Rebuilds every closed `trove:` block of a text from the index; blocks that cannot be built stay
 * as they are and are returned as problems.
 */
export const fillLiveBlocks = (
  text: string,
  rel: string,
  index: StoreIndex,
): { text: string; problems: BlockProblem[] } => {
  const eol = eolOf(text);
  const base = baseFilters(text);
  const problems: BlockProblem[] = [];
  const blocks = findLiveBlocks(splitLines(text));
  const filled = blocks.reduceRight((current, block) => {
    if (!block.close) {
      problems.push({ block, message: `<!-- trove:${block.view} --> is never closed` });
      return current;
    }
    try {
      const body = renderView(block.view, block.args, { index, rel, base }).replaceAll("\n", eol);
      return `${current.slice(0, block.open.end)}${eol}${body}${eol}${current.slice(block.close.start)}`;
    } catch (error) {
      problems.push({ block, message: (error as Error).message });
      return current;
    }
  }, text);
  return { text: filled, problems: problems.reverse() };
};
