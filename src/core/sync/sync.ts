import type { Config } from "../config/schema.ts";
import { TroveError } from "../errors.ts";
import type { Outcome } from "../ops/apply.ts";
import { writeReports } from "../reports/write.ts";
import { hasErrors } from "../rules/diagnostic.ts";
import { runRules } from "../rules/run.ts";
import { openStore, type Store } from "../store/open.ts";
import { commitPaths, isRepositoryRoot, pushWithRebase } from "./git-steps.ts";

export type SyncResult = {
  mode: Config["sync"];
  commit: string | undefined;
  pushed: boolean;
  warnings: readonly string[];
};

const idle = (mode: Config["sync"], warnings: readonly string[] = []): SyncResult => ({
  mode,
  commit: undefined,
  pushed: false,
  warnings,
});

const rebuildReports = async (root: string, today: string): Promise<string[]> => {
  const store = await openStore({ cwd: root, store: root, today });
  const results = await writeReports(store.index, Object.keys(store.config.reports));
  return results.filter((result) => result.changed).map((result) => result.output);
};

const isGreen = async (root: string, today: string): Promise<boolean> => {
  const store = await openStore({ cwd: root, store: root, today });
  return !hasErrors(runRules(store.rules, store.index));
};

const record = async (
  store: Store,
  paths: readonly string[] | "all",
  message: string,
): Promise<SyncResult> => {
  const { sync: mode } = store.config;
  if (!(await isRepositoryRoot(store.root))) {
    return idle(mode, ["the store is not the root of a git repository: not committed"]);
  }
  if (!(await isGreen(store.root, store.index.today)))
    return idle(mode, ["check is red: not committed"]);

  const committed = await commitPaths(store.root, paths, message);
  if (committed.error) return idle(mode, [`not committed: ${committed.error}`]);
  if (mode !== "push" || !committed.sha) return { ...idle(mode), commit: committed.sha };

  const generated = Object.values(store.config.reports).map((report) => report.output);
  const pushed = await pushWithRebase(store.root, generated, () =>
    rebuildReports(store.root, store.index.today),
  );
  return {
    mode,
    commit: committed.sha,
    pushed: pushed.pushed,
    warnings: pushed.warning ? [pushed.warning] : [],
  };
};

/** One commit per operation, by the store's `sync` mode; `off` leaves git alone. */
export const syncOutcome = (store: Store, outcome: Outcome): Promise<SyncResult> => {
  if (store.config.sync === "off" || !outcome.written)
    return Promise.resolve(idle(store.config.sync));
  const paths = outcome.changes.flatMap((change) =>
    change.from ? [change.rel, change.from] : [change.rel],
  );
  return record(store, paths, outcome.message);
};

/** Commits hand edits with rebuilt reports, then pushes by mode; refuses while check is red. */
export const syncStore = async (store: Store, message?: string): Promise<SyncResult> => {
  if (store.config.sync === "off") {
    throw new TroveError("sync is off in trove.yaml: set it to commit or push");
  }
  await rebuildReports(store.root, store.index.today);
  if (!(await isGreen(store.root, store.index.today)))
    throw new TroveError("check is red: fix the errors, then sync");
  return record(store, "all", message ?? "docs: sync hand edits");
};

/** Pushes commits made outside an operation, e.g. by a resync, when the store pushes. */
export const pushStore = async (store: Store): Promise<SyncResult> => {
  if (store.config.sync !== "push") return idle(store.config.sync);
  const generated = Object.values(store.config.reports).map((report) => report.output);
  const pushed = await pushWithRebase(store.root, generated, () =>
    rebuildReports(store.root, store.index.today),
  );
  return {
    ...idle(store.config.sync, pushed.warning ? [pushed.warning] : []),
    pushed: pushed.pushed,
  };
};
