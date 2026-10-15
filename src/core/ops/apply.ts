import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { planGenerated } from "../reports/write.ts";
import type { Diagnostic } from "../rules/diagnostic.ts";
import { runRules } from "../rules/run.ts";
import type { Store } from "../store/open.ts";
import type { Change, Plan } from "./plan.ts";
import { withChanges } from "./with-changes.ts";

export type AppliedChange = Change & { previous: string | undefined };

export type Outcome = {
  /** Document edits followed by rebuilt reports; nothing is written when `introduced` is not empty. */
  changes: readonly AppliedChange[];
  introduced: readonly Diagnostic[];
  notes: readonly string[];
  message: string;
  written: boolean;
};

/** Errors the change adds; a moved file's old errors count under its new path. */
const introducedErrors = (before: Diagnostic[], after: Diagnostic[], plan: Plan): Diagnostic[] => {
  const moved = new Map(plan.changes.flatMap((c) => (c.from ? [[c.from, c.rel] as const] : [])));
  const touched = new Set(plan.changes.map((change) => change.rel));
  const key = (d: Diagnostic) => `${moved.get(d.file) ?? d.file}\0${d.rule}\0${d.message}`;
  const remaining = Map.groupBy(
    before.filter((d) => d.severity === "error"),
    key,
  );
  return after.filter((d) => {
    if (d.severity !== "error") return false;
    if (touched.has(d.file) && plan.tolerate?.includes(d.rule)) return false;
    const same = remaining.get(key(d));
    return !same?.pop();
  });
};

const previousText = async (root: string, change: Change): Promise<string | undefined> => {
  const file = Bun.file(join(root, change.from ?? change.rel));
  return (await file.exists()) ? file.text() : undefined;
};

const write = async (root: string, changes: readonly Change[]): Promise<void> => {
  for (const change of changes) {
    const path = join(root, change.rel);
    if (change.from) await rm(join(root, change.from), { force: true });
    if (change.text === undefined) {
      await rm(path, { force: true });
    } else {
      await mkdir(dirname(path), { recursive: true });
      await Bun.write(path, change.text);
    }
  }
};

/** Checks the result in memory first: a change that adds errors never reaches the disk. */
export const applyPlan = async (
  store: Store,
  plan: Plan,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<Outcome> => {
  const after = withChanges(store.index, plan.changes);
  const introduced = introducedErrors(
    runRules(store.rules, store.index),
    runRules(store.rules, after),
    plan,
  );
  const reports = (await planGenerated(after, Object.keys(store.config.reports)))
    .filter((report) => report.changed)
    .map((report): Change => ({ rel: report.output, text: report.text }));
  const changes = await Promise.all(
    [...plan.changes, ...reports].map(async (change) => ({
      ...change,
      previous: await previousText(store.root, change),
    })),
  );

  const written = introduced.length === 0 && !dryRun;
  if (written) await write(store.root, changes);
  return { changes, introduced, notes: plan.notes, message: plan.message, written };
};
