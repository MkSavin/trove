import type { Config } from "../config/schema.ts";
import { hasCapability, ledgerOf } from "../config/vocabulary.ts";
import { PROMPT_MARKER } from "../document/prompt.ts";
import { ledgerSection } from "./new-document.ts";

const LINE_BREAK = /\r?\n/;
const TITLE = /^# /;
const FENCE = "---";

const isBlank = (line: string | undefined): boolean => line !== undefined && line.trim() === "";

const firstFilled = (lines: readonly string[], from: number): number => {
  let at = from;
  while (isBlank(lines[at])) at++;
  return at;
};

const trimBlankEdges = (lines: readonly string[]): string[] => {
  const start = firstFilled(lines, 0);
  const end = lines.findLastIndex((line) => !isBlank(line));
  return lines.slice(start, end + 1);
};

/** Indexes of the template's title and status line, -1 when it has none. */
const headOf = (lines: readonly string[], statusPrefix: string) => {
  const header = lines[0] === FENCE ? lines.indexOf(FENCE, 1) + 1 : 0;
  const title = lines.findIndex((line, i) => i >= header && TITLE.test(line));
  const next = firstFilled(lines, title + 1);
  const status = title >= 0 && lines[next]?.startsWith(statusPrefix) ? next : -1;
  return { header, title, status };
};

/** Blocks the type needs that the body does not carry: an empty ledger, the prompt marker. */
const missingBlocks = (config: Config, type: string, body: readonly string[]): string[] => {
  const kind = config.types[type];
  const has = (marker: string) => body.some((line) => line.trim() === `<!-- ${marker} -->`);
  const ledger = ledgerOf(config, kind);
  return [
    ...(hasCapability(kind, "ledger") && ledger && !has(ledger.marker)
      ? ledgerSection(config, type)
      : []),
    ...(hasCapability(kind, "prompt-body") && !has(PROMPT_MARKER)
      ? [`<!-- ${PROMPT_MARKER} -->`, ""]
      : []),
  ];
};

/**
 * The new document with `body` in place of everything after its title and status line.
 * A body that opens with its own `# ` title, or then a status line, replaces the template's.
 */
export const withBody = (config: Config, type: string, template: string, body: string): string => {
  const eol = template.includes("\r\n") ? "\r\n" : "\n";
  const lines = template.split(LINE_BREAK);
  const statusPrefix = `**${config.labels.statusLine}:**`;
  const head = headOf(lines, statusPrefix);
  const kept = lines.slice(0, Math.max(head.status, head.title, head.header - 1) + 1);

  let rest = trimBlankEdges(body.split(LINE_BREAK));
  const [first] = rest;
  if (head.title >= 0 && first !== undefined && TITLE.test(first)) {
    kept[head.title] = first;
    const next = firstFilled(rest, 1);
    const own = rest[next];
    if (head.status >= 0 && own?.startsWith(statusPrefix)) {
      kept[head.status] = own;
      rest = trimBlankEdges(rest.slice(next + 1));
    } else {
      rest = trimBlankEdges(rest.slice(1));
    }
  }

  return [
    ...kept,
    ...(kept.length > 0 ? [""] : []),
    ...missingBlocks(config, type, rest),
    ...rest,
    "",
  ].join(eol);
};
