import { basename } from "node:path";
import type { Config, DocumentTypeConfig } from "../config/schema.ts";
import {
  closedLedgerOf,
  hasCapability,
  keyOf,
  ledgerOf,
  typeConfig,
} from "../config/vocabulary.ts";
import { findBlock, findBlocks } from "../markdown/blocks.ts";
import { fencedLines } from "../markdown/fences.ts";
import { type FrontMatter, parseFrontMatter } from "../markdown/front-matter.ts";
import { type Heading, parseHeadings } from "../markdown/headings.ts";
import { findLinks, type Link } from "../markdown/links.ts";
import { type Place, placeOf } from "../store/paths.ts";
import { type Line, splitLines } from "../text/lines.ts";
import { type Ledger, readLedger } from "./ledger.ts";
import { PROMPT_MARKER, type PromptBody, readPrompt } from "./prompt.ts";
import { readStages, type Stage } from "./stages.ts";
import { readStatusLine, type StatusLine } from "./status-line.ts";

export type Document = {
  path: string;
  /** Store-relative, forward slashes. */
  rel: string;
  name: string;
  place: Place;
  folder: string | undefined;
  text: string;
  lines: readonly Line[];
  frontMatter: FrontMatter | undefined;
  meta: Readonly<Record<string, string>>;
  type: string | undefined;
  typeConfig: DocumentTypeConfig | undefined;
  /** Status key; missing when the header value is outside the vocabulary. */
  status: string | undefined;
  headings: readonly Heading[];
  links: readonly Link[];
  statusLine: StatusLine | undefined;
  /** Present only for types with the matching capability and a marker in the text; closed items for `resolved-of`. */
  ledger: Ledger | undefined;
  prompt: PromptBody | undefined;
  /** Empty unless the type has `stages` and the body a task list or a stage table. */
  stages: readonly Stage[];
};

export type Source = { path: string; rel: string; text: string };

export const parseDocument = ({ path, rel, text }: Source, config: Config): Document => {
  const lines = splitLines(text);
  const fenced = fencedLines(lines);
  const frontMatter = parseFrontMatter(lines);
  const meta = Object.fromEntries(
    [...(frontMatter?.fields.values() ?? [])].map(({ key, value }) => [key, value]),
  );
  const type = meta.type;
  const kind = typeConfig(config, type);
  const body = lines.slice(frontMatter?.endLine ?? 0);

  const ledgerConfig = hasCapability(kind, "ledger")
    ? ledgerOf(config, kind)
    : hasCapability(kind, "resolved-of")
      ? closedLedgerOf(config, type)
      : undefined;
  const ledgerBlocks = ledgerConfig ? findBlocks(lines, fenced, ledgerConfig.marker) : [];
  const headings = parseHeadings(lines, fenced, text.length);
  const promptBlock = hasCapability(kind, "prompt-body")
    ? findBlock(lines, fenced, PROMPT_MARKER)
    : undefined;

  return {
    path,
    rel,
    name: basename(rel),
    ...placeOf(rel, config),
    text,
    lines,
    frontMatter,
    meta,
    type,
    typeConfig: kind,
    status: meta.status === undefined ? undefined : keyOf(config.statuses, meta.status),
    headings,
    links: findLinks(lines, fenced),
    statusLine: frontMatter ? readStatusLine(body, config.labels) : undefined,
    ledger:
      ledgerConfig && ledgerBlocks.length > 0
        ? readLedger(ledgerBlocks, rel, ledgerConfig, headings, hasCapability(kind, "resolved-of"))
        : undefined,
    prompt: promptBlock ? readPrompt(promptBlock, text) : undefined,
    stages: hasCapability(kind, "stages")
      ? readStages(body, fenced, ledgerBlocks, config.stages)
      : [],
  };
};

export const stemOf = (doc: Document): string => doc.name.replace(/\.md$/, "");
