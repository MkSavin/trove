import type { StagesConfig } from "../config/schema.ts";
import { findLiveBlocks } from "../live/blocks.ts";
import type { Block } from "../markdown/blocks.ts";
import { parseTables } from "../markdown/tables.ts";
import type { Line } from "../text/lines.ts";
import { isBareNumber } from "./stage-code.ts";
import { isDone } from "./stage-done.ts";
import { stageHeadings, stageLabels } from "./stage-sections.ts";
import { shortTitle, stripMarkup } from "./stage-text.ts";

export type Stage = { title: string; done: boolean };

export type FoundStages = { line: number; stages: Stage[] };

const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\](?:\s+(.*))?$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/** The first task list, read until a line that is neither blank, indented nor a list item. */
const taskList = (lines: readonly Line[]): FoundStages | undefined => {
  const start = lines.findIndex((line) => TASK.test(line.text));
  const first = lines[start];
  if (!first) return undefined;
  const indent = TASK.exec(first.text)?.[1];
  const stages: Stage[] = [];
  for (const { text } of lines.slice(start)) {
    const task = TASK.exec(text);
    if (task) {
      if (task[1] === indent)
        stages.push({ title: shortTitle(task[3] ?? ""), done: task[2] !== " " });
    } else if (text.trim() !== "" && !/^\s/.test(text) && !LIST_ITEM.test(text)) {
      break;
    }
  }
  return { line: first.number, stages };
};

/** A stage's title is its first cell that is more than a stage number or code. */
const titleOf = (cells: readonly string[]): string =>
  shortTitle(
    cells.find((cell) => cell !== "" && !isBareNumber(stripMarkup(cell))) ??
      cells.find(Boolean) ??
      "",
  );

const stageTable = (lines: readonly Line[], config: StagesConfig): FoundStages | undefined => {
  const status = new Set(config.status.map((name) => name.toLowerCase()));
  for (const { header, rows } of parseTables(lines)) {
    const column =
      header?.cells.findIndex((cell) => status.has(stripMarkup(cell).toLowerCase())) ?? -1;
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
 * Stages of whichever comes first: a task list, a table with a status column, or coded headings
 * or bold labels (`Э1`, `Stage 2`); generated blocks, ledgers and fenced code are skipped.
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
  const found = [
    taskList(visible),
    stageTable(visible, config),
    stageHeadings(visible, config),
    stageLabels(visible, config),
  ]
    .filter((structure) => structure !== undefined)
    .toSorted((a, b) => a.line - b.line);
  return found[0]?.stages ?? [];
};
