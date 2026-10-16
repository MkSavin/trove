import type { StagesConfig } from "../config/schema.ts";
import { type Heading, parseHeadings } from "../markdown/headings.ts";
import type { Line } from "../text/lines.ts";
import { type StageCode, stageCode } from "./stage-code.ts";
import { cutDoneParenthesis, isDoneStatusLine, isOnlyDone } from "./stage-done.ts";
import { shortTitle, stripMarkup } from "./stage-text.ts";
import type { FoundStages, Stage } from "./stages.ts";

type CodedTitle = { code: StageCode; name: string; done: boolean };

/** A lone coded heading or label is too weak a sign of stages. */
const MIN_RUN = 2;
const STATUS_LINES = 3;
const LEADING_MARK = /^(?:(\[[xX]\]|[✅✓✔☑])|\[ \]|[☐⬜])️?\s*/u;
const TRAILING_MARK = /\s*[✅✓✔]️?$/u;
const LABEL = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?\*\*(.+?)\*\*(.*)$/;
const HEADING = /^#{1,6}\s/;

/** `[x] Э1. Catalog (merged)`, `Stage 2 — Search ✅` or `Б3 — merged.` */
const codedTitle = (raw: string, done: readonly string[]): CodedTitle | undefined => {
  const text = stripMarkup(raw);
  const lead = LEADING_MARK.exec(text);
  const code = stageCode(text.slice(lead?.[0].length ?? 0));
  if (!code) return undefined;
  const trail = TRAILING_MARK.exec(code.rest);
  const cut = cutDoneParenthesis(trail ? code.rest.slice(0, trail.index) : code.rest, done);
  const onlyDone = isOnlyDone(cut.text, done);
  return {
    code,
    name: onlyDone ? "" : cut.text,
    done: lead?.[1] !== undefined || trail !== null || cut.done || onlyDone,
  };
};

const stageOf = ({ code, name }: CodedTitle, done: boolean): Stage => ({
  title: name.trim() === "" ? code.code : `${code.code} — ${shortTitle(name)}`,
  done,
});

const hasDoneStatusLine = (lines: readonly Line[], config: StagesConfig): boolean =>
  lines
    .filter((line) => line.text.trim() !== "")
    .slice(0, STATUS_LINES)
    .some((line) => isDoneStatusLine(line.text, config.status, config.done));

/** Sibling headings in a row that share a code prefix; their sub-headings may sit between them. */
const headingRun = (
  headings: readonly Heading[],
  config: StagesConfig,
): { heading: Heading; title: CodedTitle }[] => {
  for (const [i, first] of headings.entries()) {
    const head = codedTitle(first.title, config.done);
    if (!head) continue;
    const run = [{ heading: first, title: head }];
    for (const next of headings.slice(i + 1)) {
      if (next.level > first.level) continue;
      const title = next.level === first.level ? codedTitle(next.title, config.done) : undefined;
      if (!title || title.code.prefix !== head.code.prefix) break;
      run.push({ heading: next, title });
    }
    if (run.length >= MIN_RUN) return run;
  }
  return [];
};

/** `### Э1. Catalog`, done by a mark in the heading or a `Status: merged` line just under it. */
export const stageHeadings = (
  lines: readonly Line[],
  config: StagesConfig,
): FoundStages | undefined => {
  const headings = parseHeadings(lines, new Set(), 0);
  const run = headingRun(headings, config);
  const first = run[0];
  if (!first) return undefined;
  const stages = run.map(({ heading, title }) => {
    const end = headings[headings.indexOf(heading) + 1]?.line ?? Number.POSITIVE_INFINITY;
    const below = lines.filter((line) => line.number > heading.line && line.number < end);
    return stageOf(title, title.done || hasDoneStatusLine(below, config));
  });
  return { line: first.heading.line, stages };
};

type Labelled = { line: number; title: CodedTitle; paragraph: Line[]; after: string };

const codedLabel = (
  text: string,
  done: readonly string[],
): { title: CodedTitle; after: string } | undefined => {
  const [, label = "", after = ""] = HEADING.test(text) ? [] : (LABEL.exec(text) ?? []);
  const title = label === "" ? undefined : codedTitle(label, done);
  return title && { title, after };
};

/** Each coded label with the lines of its paragraph, up to a blank line or the next coded label. */
const labelledParagraphs = (lines: readonly Line[], config: StagesConfig): Labelled[] =>
  lines.flatMap((line, i) => {
    const label = codedLabel(line.text, config.done);
    if (!label) return [];
    const paragraph: Line[] = [];
    for (const next of lines.slice(i + 1)) {
      const continues =
        next.number === (paragraph.at(-1) ?? line).number + 1 &&
        next.text.trim() !== "" &&
        !HEADING.test(next.text) &&
        !codedLabel(next.text, config.done);
      if (!continues) break;
      paragraph.push(next);
    }
    return [{ line: line.number, paragraph, ...label }];
  });

/** `**Б1.** text … (merged)` or `**Б1 — merged.** text`, in a row of labels sharing a code prefix. */
export const stageLabels = (
  lines: readonly Line[],
  config: StagesConfig,
): FoundStages | undefined => {
  const labelled = labelledParagraphs(lines, config);
  for (const [i, first] of labelled.entries()) {
    const sameCode = labelled
      .slice(i)
      .findIndex((entry) => entry.title.code.prefix !== first.title.code.prefix);
    const run = labelled.slice(i, sameCode < 0 ? undefined : i + sameCode);
    if (run.length < MIN_RUN) continue;
    const stages = run.map(({ title, paragraph, after }) => {
      const text = cutDoneParenthesis(
        [after, ...paragraph.map((line) => line.text)].join(" ").trim(),
        config.done,
      );
      const done = title.done || text.done || hasDoneStatusLine(paragraph, config);
      return stageOf(title.name === "" ? { ...title, name: text.text } : title, done);
    });
    return { line: first.line, stages };
  }
  return undefined;
};
