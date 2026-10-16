import { posix } from "node:path";
import type { StoreIndex } from "../core/index/index.ts";
import { parseFrontMatter } from "../core/markdown/front-matter.ts";
import { splitLines } from "../core/text/lines.ts";
import { docHref } from "./html.ts";
import { type LinkResolver, renderMarkdown } from "./markdown.ts";

const WEB_LINK = /^https?:\/\//i;
const SCHEME = /^[a-z][\w+.-]*:/i;

const decoded = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** Links to other store documents open their view; code and other relative links stay text. */
const linksFrom =
  (index: StoreIndex, from: string): LinkResolver =>
  (target) => {
    if (WEB_LINK.test(target)) return target;
    if (SCHEME.test(target) || target.startsWith("#")) return undefined;
    const path = decoded(target.split("#")[0] ?? "");
    const rel = posix.normalize(posix.join(posix.dirname(from), path));
    return index.byRel.has(rel) ? docHref(rel) : undefined;
  };

const bodyOf = (text: string): string => {
  const lines = splitLines(text);
  return lines
    .slice(parseFrontMatter(lines)?.endLine ?? 0)
    .map((line) => line.text)
    .join("\n");
};

/** A document's text without its header, as HTML; `rel` is where its relative links start. */
export const renderStoreMarkdown = (index: StoreIndex, text: string, rel: string): string =>
  renderMarkdown(bodyOf(text), linksFrom(index, rel));
