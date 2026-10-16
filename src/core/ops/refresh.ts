import type { Document } from "../document/document.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { withGitData } from "../live/git-data.ts";
import { isSnapshot } from "../live/snapshot.ts";
import { refreshGenerated } from "../reports/embeds.ts";
import type { Plan } from "./plan.ts";

/**
 * Refills the generated blocks of the named documents, a summary past its date included; with no
 * names, of every document that is not a snapshot. Archived documents keep theirs.
 */
export const refreshPlan = async (index: StoreIndex, named: readonly Document[]): Promise<Plan> => {
  const archived = named.find((doc) => doc.place === "archive");
  if (archived) throw new TroveError(`${archived.rel} is archived: its blocks are a snapshot`);
  const docs = named.length > 0 ? named : index.documents.filter((doc) => !isSnapshot(doc, index));
  const withData = await withGitData(index, docs);
  const changes = docs.flatMap((doc) => {
    const text = refreshGenerated(doc.text, doc.rel, withData);
    return text === doc.text ? [] : [{ rel: doc.rel, text }];
  });
  return {
    changes,
    notes:
      changes.length > 0
        ? changes.map((change) => `refilled ${change.rel}`)
        : ["nothing to refill"],
    message: "docs: refill generated blocks",
  };
};
