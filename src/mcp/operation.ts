import type { Plan } from "../core/ops/plan.ts";
import { runOperation } from "../core/ops/run.ts";
import { changedFile } from "../core/ops/summary.ts";
import type { Store } from "../core/store/open.ts";
import { lineDiff } from "../core/text/diff.ts";
import { json, type ToolResult } from "./respond.ts";

const DIFF_LIMIT = 40;

/** What an edit did, compact enough for a model to verify: files, line diffs, refusals, sync. */
export const runPlanTool = async (
  store: Store,
  plan: Plan,
  dryRun = false,
): Promise<ToolResult> => {
  const { outcome, sync } = await runOperation(store, plan, { dryRun });
  const refused = outcome.introduced.length > 0;
  return json({
    written: outcome.written,
    ...(refused
      ? {
          refused: "the change would add these errors; nothing was written",
          errors: outcome.introduced,
        }
      : {}),
    files: outcome.changes.map((change) => ({
      ...changedFile(change),
      diff: lineDiff(change.previous ?? "", change.text ?? "")
        .slice(0, DIFF_LIMIT)
        .map(({ kind, line, text }) => `${kind}${line} ${text}`),
    })),
    notes: outcome.notes,
    ...(sync.commit || sync.warnings.length > 0
      ? { sync: { commit: sync.commit, pushed: sync.pushed, warnings: sync.warnings } }
      : {}),
  });
};
