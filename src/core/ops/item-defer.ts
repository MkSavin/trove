import type { LedgerConfig } from "../config/schema.ts";
import { labelOf } from "../config/vocabulary.ts";
import { setHeadingNote } from "../edit/heading.ts";
import { setCell } from "../edit/ledger.ts";
import { linkFrom } from "../edit/links.ts";
import { applyPatches } from "../edit/patch.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { itemHeading } from "../index/resolve.ts";
import { requireDocument, requireItem } from "./find.ts";
import { moveItem } from "./item-move.ts";
import type { Plan } from "./plan.ts";

const DEFERRED = "deferred";

const deferredLabel = (ledger: LedgerConfig, where: string): string => {
  const statuses = ledger.columns.find((column) => column.key === "status")?.enum;
  if (statuses && !Object.hasOwn(statuses, DEFERRED)) {
    throw new TroveError(`the status column of ${where} has no ${DEFERRED} value`);
  }
  return labelOf(statuses ?? {}, DEFERRED);
};

export const deferItem = (index: StoreIndex, id: string): Plan => {
  const { doc, ledger, table, row } = requireItem(index, id);
  const label = deferredLabel(ledger, doc.rel);
  const heading = itemHeading(doc, id);
  const text = applyPatches(doc.text, [
    setCell(row, table.keys.indexOf("status"), label),
    ...(heading ? setHeadingNote(doc, heading, label, ledger) : []),
  ]);
  return { changes: [{ rel: doc.rel, text }], notes: [], message: `docs: defer ${id}` };
};

export type DeferInto = {
  to: string;
  /** Cells by column key, such as `why` and `until`; `from` defaults to a link to the item's document. */
  values?: Readonly<Record<string, string>> | undefined;
  archive?: boolean | undefined;
};

/** Moves the item into a register of deferred work, its status deferred there. */
export const deferInto = async (
  index: StoreIndex,
  id: string,
  options: DeferInto,
): Promise<Plan> => {
  const { doc } = requireItem(index, id);
  const register = requireDocument(index, options.to);
  const ledger = register.ledger?.config;
  if (!ledger) throw new TroveError(`${register.rel} has no ledger`);
  const from = `[${id}](${linkFrom(register.rel, doc.rel)})`;
  const cells = { from, ...options.values, status: deferredLabel(ledger, register.rel) };
  return moveItem(index, id, options.to, { archive: options.archive, cells });
};
