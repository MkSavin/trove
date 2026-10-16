import { parseFilterText } from "../../core/index/filters.ts";
import type { StoreIndex } from "../../core/index/index.ts";
import { type Kind, queryRows } from "../../core/index/rows.ts";
import { filterForm } from "../html.ts";
import { rowsTable } from "../rows.ts";
import type { Page } from "./page.ts";

const FILTER_HINT = "status=open owner=web path=!audits/mobile/**";

const columnsOf = (text: string): string[] | undefined => {
  const columns = text
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  return columns.length > 0 ? columns : undefined;
};

/** The CLI `query` as a page: `q` holds its filters, `columns` its `--columns`. */
const queryPage = (index: StoreIndex, kind: Kind, params: URLSearchParams): Page => {
  const q = params.get("q") ?? "";
  const columns = params.get("columns") ?? "";
  const { fields, rows } = queryRows(index, kind, parseFilterText(q), columnsOf(columns));
  const form = filterForm(kind === "items" ? "/items" : "/", [
    { name: "q", value: q, placeholder: FILTER_HINT },
    { name: "columns", value: columns, placeholder: fields.join(",") },
  ]);
  const count = `<p class="muted">${rows.length} ${kind}</p>`;
  const title = kind === "items" ? "Items" : "Documents";
  return { title, body: `<h1>${title}</h1>${form}${count}${rowsTable(index, fields, rows)}` };
};

export const documentsPage = (index: StoreIndex, params: URLSearchParams): Page =>
  queryPage(index, "documents", params);

export const itemsPage = (index: StoreIndex, params: URLSearchParams): Page =>
  queryPage(index, "items", params);
