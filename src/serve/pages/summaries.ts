import type { StoreIndex } from "../../core/index/index.ts";
import { queryRows } from "../../core/index/rows.ts";
import { showSummary } from "../../core/summaries/summaries.ts";
import { escapeHtml } from "../html.ts";
import { rowsTable } from "../rows.ts";
import { renderStoreMarkdown } from "../store-markdown.ts";
import type { Page } from "./page.ts";

const DEFAULT_TYPE = "summary";

const kindLinks = (index: StoreIndex, current: string): string => {
  const kinds = [
    ["", "built-in"],
    ...Object.entries(index.config.summaries).map(([key, kind]) => [key, kind.title]),
  ];
  const links = kinds.map(([key = "", title = ""]) => {
    const label = escapeHtml(title);
    if (key === current) return `<strong>${label}</strong>`;
    return `<a href="/summaries${key ? `?kind=${encodeURIComponent(key)}` : ""}">${label}</a>`;
  });
  return `<p>${links.join(" · ")}</p>`;
};

const writtenSummaries = (index: StoreIndex): string => {
  const types = new Set(Object.values(index.config.summaries).map((kind) => kind.type));
  const filter = { type: types.size > 0 ? [...types] : [DEFAULT_TYPE] };
  const { fields, rows } = queryRows(index, "documents", filter, ["path", "status", "date"]);
  return rows.length > 0 ? `<h2>Written summaries</h2>${rowsTable(index, fields, rows)}` : "";
};

/** A summary of the chosen kind as of now, like `summary show`, then the written ones. */
export const summariesPage = async (index: StoreIndex, params: URLSearchParams): Promise<Page> => {
  const kind = params.get("kind") ?? "";
  const live = await showSummary(index, { kind: kind || undefined });
  return {
    title: "Summaries",
    body: `${kindLinks(index, kind)}${renderStoreMarkdown(index, live, "SUMMARY.md")}${writtenSummaries(index)}`,
  };
};
