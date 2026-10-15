import type { Plan } from "../core/ops/plan.ts";
import { runOperation } from "../core/ops/run.ts";
import type { Store } from "../core/store/open.ts";
import { STORE_OPTIONS } from "./args.ts";
import { EXIT } from "./command.ts";
import { printOutcome } from "./format/outcome.ts";
import { printSync } from "./format/sync.ts";
import type { Io } from "./io.ts";

export const OP_OPTIONS = {
  ...STORE_OPTIONS,
  "dry-run": { type: "boolean", default: false },
} as const;

/** Applies the plan, prints it, then commits and pushes by the store's sync mode. */
export const runPlan = async (
  store: Store,
  plan: Plan,
  io: Io,
  dryRun: boolean,
): Promise<number> => {
  const { outcome, sync } = await runOperation(store, plan, { dryRun });
  const code = await printOutcome(outcome, io, dryRun);
  if (code === EXIT.ok) printSync(sync, io);
  return code;
};
