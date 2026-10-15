import { keyOf, labelOf } from "../config/vocabulary.ts";
import { stemOf } from "../document/document.ts";
import { setField } from "../edit/front-matter.ts";
import { applyPatches } from "../edit/patch.ts";
import { setStatusLine } from "../edit/status-line.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { requireDocument } from "./find.ts";
import type { Plan } from "./plan.ts";

/** Writes a header field; `status` and `checked` also update the visible status line. */
export const setDocumentField = (
  index: StoreIndex,
  name: string,
  field: string,
  value: string,
): Plan => {
  const doc = requireDocument(index, name);
  const statusKey = field === "status" ? keyOf(index.config.statuses, value) : undefined;
  if (field === "status" && statusKey === undefined)
    throw new TroveError(`unknown status ${value}`);

  const written = statusKey === undefined ? value : labelOf(index.config.statuses, statusKey);
  const text = applyPatches(doc.text, [
    setField(doc, field, written),
    ...setStatusLine(doc, {
      status: field === "status" ? written : undefined,
      checked: field === "checked" ? written : undefined,
    }),
  ]);
  const message =
    field === "checked" ? `docs: check ${stemOf(doc)}` : `docs: set ${field} of ${stemOf(doc)}`;
  return { changes: [{ rel: doc.rel, text }], notes: [], message };
};
