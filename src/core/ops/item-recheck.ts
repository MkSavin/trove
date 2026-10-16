import { existsSync } from "node:fs";
import type { Document } from "../document/document.ts";
import type { Item, LedgerTable } from "../document/ledger.ts";
import { appendColumn, setCell } from "../edit/ledger.ts";
import { applyPatches, type Patch } from "../edit/patch.ts";
import { TroveError } from "../errors.ts";
import { gitSync } from "../git/git.ts";
import { CHECKED } from "../index/checked.ts";
import { itemCodeRefs } from "../index/code-refs.ts";
import { unchangedInContent } from "../index/content-drift.ts";
import { mergeFilters } from "../index/filters.ts";
import { HEAD } from "../index/git-reads.ts";
import type { StoreIndex } from "../index/index.ts";
import { type CodeRoot, rootKey } from "../index/links.ts";
import { type Filters, selectItems } from "../index/query.ts";
import { type LocatedItem, requireItem } from "./find.ts";
import type { Plan } from "./plan.ts";

export type Recheck = {
  ids?: readonly string[] | undefined;
  /** Adds every open item with `drift=true`. */
  drifted?: boolean | undefined;
  /** Adds every open item matching them. */
  filters?: Filters | undefined;
  /** Keeps only items whose code reads the same as at their check, whitespace aside. */
  unchanged?: boolean | undefined;
};

type Written = { located: LocatedItem; value: string };

const chosen = (index: StoreIndex, { ids = [], drifted, filters = {} }: Recheck): Item[] => {
  const wanted = mergeFilters(filters, drifted ? { drift: ["true"] } : {});
  const bulk = Object.keys(wanted).length > 0;
  if (ids.length === 0 && !bulk)
    throw new TroveError("item recheck needs ids, --drifted or filters");
  const named = ids.map((id) => requireItem(index, id).item);
  return [...new Set([...named, ...(bulk ? selectItems(index, wanted) : [])])];
};

const headOf = (root: CodeRoot): string | undefined => {
  if (!existsSync(root.dir)) return undefined;
  const head = gitSync(root.dir, ["rev-parse", "--short", `${root.ref ?? HEAD}^{commit}`]);
  return head.ok && head.out ? head.out : undefined;
};

/** The commit of the one code root the item points into; today when it points into none or several. */
const checkedNow = (index: StoreIndex, doc: Document, item: Item): string => {
  const roots = new Map(itemCodeRefs(index, doc, item).map((ref) => [rootKey(ref.root), ref.root]));
  const [root, ...others] = roots.values();
  return (root && others.length === 0 && headOf(root)) || index.today;
};

const located = (index: StoreIndex, item: Item): LocatedItem => {
  const found = requireItem(index, item.id);
  if (!found.ledger.columns.some((column) => column.key === CHECKED)) {
    throw new TroveError(
      `${found.doc.rel}: its ledger has no ${CHECKED} column; add { key: ${CHECKED}, label: ${CHECKED} } to its columns`,
    );
  }
  return found;
};

/** Only the rechecked rows change; a new column leaves the other rows as they are. */
const tablePatches = (doc: Document, table: LedgerTable, written: readonly Written[]): Patch[] => {
  const found = table.keys.indexOf(CHECKED);
  const column = found >= 0 ? found : table.keys.length;
  const label = written[0]?.located.ledger.columns.find((c) => c.key === CHECKED)?.label ?? CHECKED;
  return [
    ...(found >= 0 ? [] : appendColumn(doc, table, label)),
    ...written.map(({ located, value }) => setCell(located.row, column, value)),
  ];
};

const documentText = (doc: Document, written: readonly Written[]): string => {
  const tables = Map.groupBy(written, ({ located }) => located.table);
  return applyPatches(
    doc.text,
    [...tables].flatMap(([table, entries]) => tablePatches(doc, table, entries)),
  );
};

/** Sets each item's `checked` cell to the commit its code is at now, so drift starts over from there. */
export const recheckItems = (index: StoreIndex, request: Recheck): Plan => {
  const items = chosen(index, request);
  const kept = request.unchanged ? items.filter((item) => unchangedInContent(index, item)) : items;
  const skipped = items.filter((item) => !kept.includes(item)).map((item) => item.id);
  const written = kept.map((item): Written => {
    const found = located(index, item);
    return { located: found, value: checkedNow(index, found.doc, item) };
  });
  const documents = Map.groupBy(written, ({ located }) => located.doc);
  return {
    changes: [...documents].map(([doc, entries]) => ({
      rel: doc.rel,
      text: documentText(doc, entries),
    })),
    message: `docs: recheck ${kept.map((item) => item.id).join(", ") || "nothing"}`,
    notes: [
      ...written.map(({ located, value }) => `${located.item.id} checked at ${value}`),
      ...(skipped.length > 0
        ? [`left as they are, their code changed: ${skipped.join(", ")}`]
        : []),
      ...(items.length === 0 ? ["nothing to recheck"] : []),
    ],
  };
};
