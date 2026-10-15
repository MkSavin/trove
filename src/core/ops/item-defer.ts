import { labelOf } from "../config/vocabulary.ts";
import { setHeadingNote } from "../edit/heading.ts";
import { setCell } from "../edit/ledger.ts";
import { applyPatches } from "../edit/patch.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { itemHeading } from "../index/resolve.ts";
import { requireItem } from "./find.ts";
import type { Plan } from "./plan.ts";

const DEFERRED = "deferred";

export const deferItem = (index: StoreIndex, id: string): Plan => {
  const { doc, table, row } = requireItem(index, id);
  const statuses = doc.ledger?.config.columns.find((column) => column.key === "status")?.enum;
  if (statuses && !Object.hasOwn(statuses, DEFERRED)) {
    throw new TroveError(`the status column has no ${DEFERRED} value`);
  }
  const label = labelOf(statuses ?? {}, DEFERRED);
  const heading = itemHeading(doc, id);
  const text = applyPatches(doc.text, [
    setCell(row, table.keys.indexOf("status"), label),
    ...(heading ? setHeadingNote(doc, heading, label) : []),
  ]);
  return { changes: [{ rel: doc.rel, text }], notes: [], message: `docs: defer ${id}` };
};
