import type { StagesConfig } from "../config/schema.ts";
import { findLiveBlocks } from "../live/blocks.ts";
import type { Block } from "../markdown/blocks.ts";
import { parseTables } from "../markdown/tables.ts";
import type { Line } from "../text/lines.ts";

export type Stage = { title: string; done: boolean };

type Found = { line: number; stages: Stage[] };

const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\](?:\s+(.*))?$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
const STAGE_NUMBER = /^#?\d+[.)]?$/;
const MARKUP = /[*_`]/g;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

const plain = (text: string): string => text.replace(MARKUP, "").trim().toLowerCase();

/** `merged 2026-10-01` and `✓ merged` count as done; `incomplete` and `not done` do not. */
const isDone = (cell: string, done: readonly string[]): boolean => {
  const text = plain(cell);
  return done.some((word) => {
    const value = word.toLowerCase();
    return text.startsWith(value) && !WORD_CHARACTER.test(text.charAt(value.length));
  });
};

/** The first task list, read until a line that is neither blank, indented nor a list item. */
const taskList = (lines: readonly Line[]): Found | undefined => {
  const start = lines.findIndex((line) => TASK.test(line.text));
  const first = lines[start];
  if (!first) return undefined;
  const indent = TASK.exec(first.text)?.[1];
  const stages: Stage[] = [];
  for (const { text } of lines.slice(start)) {
    const task = TASK.exec(text);
    if (task) {
      if (task[1] === indent) stages.push({ title: task[3]?.trim() ?? "", done: task[2] !== " " });
    } else if (text.trim() !== "" && !/^\s/.test(text) && !LIST_ITEM.test(text)) {
      break;
    }
  }
  return { line: first.number, stages };
};

/** A stage's title is its first cell that is more than a stage number. */
const titleOf = (cells: readonly string[]): string =>
  cells.find((cell) => cell !== "" && !STAGE_NUMBER.test(plain(cell))) ?? cells.find(Boolean) ?? "";

const stageTable = (lines: readonly Line[], config: StagesConfig): Found | undefined => {
  const status = new Set(config.status.map((name) => name.toLowerCase()));
  for (const { header, rows } of parseTables(lines)) {
    const column = header?.cells.findIndex((cell) => status.has(plain(cell))) ?? -1;
    if (!header || column < 0) continue;
    const stages = rows
      .filter((row) => row.cells.some(Boolean))
      .map((row) => ({
        title: titleOf(row.cells.filter((_, i) => i !== column)),
        done: isDone(row.cells[column] ?? "", config.done),
      }));
    return { line: header.line.number, stages };
  }
  return undefined;
};

/**
 * Top-level stages of whichever comes first in the body, a task list or a table with a status
 * column; generated blocks, ledgers and fenced code are skipped.
 */
export const readStages = (
  body: readonly Line[],
  fenced: ReadonlySet<number>,
  ledgerBlocks: readonly Block[],
  config: StagesConfig,
): Stage[] => {
  const skipped = [...ledgerBlocks, ...findLiveBlocks(body)].map(({ open, close }) => ({
    from: open.number,
    to: close?.number ?? Number.POSITIVE_INFINITY,
  }));
  const visible = body.filter(
    (line) =>
      !fenced.has(line.number) &&
      !skipped.some(({ from, to }) => line.number >= from && line.number <= to),
  );
  const found = [taskList(visible), stageTable(visible, config)]
    .filter((structure) => structure !== undefined)
    .toSorted((a, b) => a.line - b.line);
  return found[0]?.stages ?? [];
};
