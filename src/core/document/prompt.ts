import type { Block } from "../markdown/blocks.ts";

export const PROMPT_MARKER = "prompt";

export type PromptBody = { line: number; text: string };

const LEADING_BREAKS = /^(?:\r?\n)+/;

/** Everything after the marker, to the end of the file. */
export const readPrompt = (block: Block, source: string): PromptBody => ({
  line: block.open.number,
  text: source.slice(block.open.end).replace(LEADING_BREAKS, ""),
});
