import type { Store } from "../store/open.ts";
import { type SyncResult, syncOutcome } from "../sync/sync.ts";
import { applyPlan, type Outcome } from "./apply.ts";
import type { Plan } from "./plan.ts";

export type Operation = { outcome: Outcome; sync: SyncResult };

/** Applies the plan, then commits and pushes by the store's sync mode when it was written. */
export const runOperation = async (
  store: Store,
  plan: Plan,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<Operation> => {
  const outcome = await applyPlan(store, plan, { dryRun });
  return { outcome, sync: await syncOutcome(store, outcome) };
};
