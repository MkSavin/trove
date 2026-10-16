import { parseTables } from "../core/markdown/tables.ts";
import { splitLines } from "../core/text/lines.ts";
import { escapeHtml, table } from "./html.ts";

/** A safe href for a link target, or undefined to show its text alone. */
export type LinkResolver = (target: string) => string | undefined;

type Block = { html: string; next: number };
type Reader = (lines: readonly string[], at: number, link: LinkResolver) => Block | undefined;

const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const BLANK = /^\s*$/;
const isTableRow = (line: string): boolean => line.trimStart().startsWith("|");
const isComment = (line: string): boolean => line.trimStart().startsWith("<!--");

/** Everything but code, links and bold is shown as escaped text. */
export const inline = (text: string, link: LinkResolver): string => {
  let html = "";
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const [whole, code, label = "", target = "", strong] = match;
    html += escapeHtml(text.slice(last, match.index));
    last = match.index + whole.length;
    if (code !== undefined) html += `<code>${escapeHtml(code)}</code>`;
    else if (strong !== undefined) html += `<strong>${inline(strong, link)}</strong>`;
    else {
      const href = link(target);
      html +=
        href === undefined
          ? escapeHtml(label)
          : `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    }
  }
  return html + escapeHtml(text.slice(last));
};

const runOf = (lines: readonly string[], at: number, test: (line: string) => boolean): number => {
  let end = at;
  while (end < lines.length && test(lines[end] ?? "")) end++;
  return end;
};

const fence: Reader = (lines, at) => {
  const marker = FENCE.exec(lines[at] ?? "")?.[1];
  if (!marker) return undefined;
  const close = lines.findIndex((line, i) => i > at && line.trimStart().startsWith(marker));
  const end = close < 0 ? lines.length : close;
  const code = escapeHtml(lines.slice(at + 1, end).join("\n"));
  return { html: `<pre><code>${code}</code></pre>`, next: end + 1 };
};

/** Generated-block markers and other HTML comments are not shown. */
const comment: Reader = (lines, at) => {
  if (!isComment(lines[at] ?? "")) return undefined;
  const close = lines.findIndex((line, i) => i >= at && line.includes("-->"));
  return { html: "", next: close < 0 ? lines.length : close + 1 };
};

const heading: Reader = (lines, at, link) => {
  const match = HEADING.exec(lines[at] ?? "");
  if (!match) return undefined;
  const level = match[1]?.length ?? 1;
  return { html: `<h${level}>${inline(match[2] ?? "", link)}</h${level}>`, next: at + 1 };
};

const rule: Reader = (lines, at) =>
  RULE.test(lines[at] ?? "") ? { html: "<hr>", next: at + 1 } : undefined;

const markdownTable: Reader = (lines, at, link) => {
  const end = runOf(lines, at, isTableRow);
  if (end === at) return undefined;
  const [parsed] = parseTables(splitLines(lines.slice(at, end).join("\n")));
  const cells = (row: { cells: readonly string[] }) => row.cells.map((cell) => inline(cell, link));
  const header = parsed?.header ? cells(parsed.header) : [];
  return { html: table(header, (parsed?.rows ?? []).map(cells)), next: end };
};

const list: Reader = (lines, at, link) => {
  const end = runOf(lines, at, (line) => LIST_ITEM.test(line));
  if (end === at) return undefined;
  const tag = ORDERED.test(lines[at] ?? "") ? "ol" : "ul";
  const items = lines
    .slice(at, end)
    .map((line) => `<li>${inline(LIST_ITEM.exec(line)?.[1] ?? "", link)}</li>`);
  return { html: `<${tag}>${items.join("")}</${tag}>`, next: end };
};

const quote: Reader = (lines, at, link) => {
  const end = runOf(lines, at, (line) => QUOTE.test(line));
  if (end === at) return undefined;
  const text = lines.slice(at, end).map((line) => QUOTE.exec(line)?.[1] ?? "");
  return { html: `<blockquote>${inline(text.join("\n"), link)}</blockquote>`, next: end };
};

const blank: Reader = (lines, at) =>
  BLANK.test(lines[at] ?? "") ? { html: "", next: at + 1 } : undefined;

const STARTERS: readonly Reader[] = [fence, comment, heading, rule, markdownTable, list, quote];

const startsBlock = (lines: readonly string[], at: number): boolean =>
  BLANK.test(lines[at] ?? "") || STARTERS.some((reader) => reader(lines, at, () => undefined));

const paragraph: Reader = (lines, at, link) => {
  let end = at + 1;
  while (end < lines.length && !startsBlock(lines, end)) end++;
  return { html: `<p>${inline(lines.slice(at, end).join("\n"), link)}</p>`, next: end };
};

const READERS: readonly Reader[] = [blank, ...STARTERS, paragraph];

/** A small Markdown subset as HTML; all document text is escaped. */
export const renderMarkdown = (text: string, link: LinkResolver): string => {
  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let at = 0;
  while (at < lines.length) {
    const block = READERS.reduce<Block | undefined>(
      (found, reader) => found ?? reader(lines, at, link),
      undefined,
    );
    if (!block) break;
    if (block.html) html.push(block.html);
    at = block.next;
  }
  return html.join("\n");
};
