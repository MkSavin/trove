import { TroveError } from "../errors.ts";
import { git, gitOrThrow } from "../git/git.ts";

const SOURCE_KEY = "trove.migrate.source";
const DROP_KEY = "trove.migrate.drop";
const MIGRATE_SUBJECT = "^trove: migrate from ";

/** The source as the store last took it in; never pushed, it lives only in this clone. */
export const STATE_REF = "refs/trove/source-state";
/** The source state a resync stopped at, waiting for conflicts to be resolved. */
export const PENDING_REF = "refs/trove/source-pending";

export type Origin = { source: string; drop: readonly string[]; state: string };

export const recordOrigin = async (
  store: string,
  source: string,
  drop: readonly string[],
  state: string,
): Promise<void> => {
  await gitOrThrow(store, ["config", SOURCE_KEY, source]);
  await git(store, ["config", "--unset-all", DROP_KEY]);
  for (const file of drop) await gitOrThrow(store, ["config", "--add", DROP_KEY, file]);
  await gitOrThrow(store, ["update-ref", STATE_REF, state]);
};

const commitOf = async (store: string, ref: string): Promise<string | undefined> => {
  const found = await git(store, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return found.ok ? found.out : undefined;
};

/** Stores migrated before the ref existed: the source state is the parent of the migration commit. */
const fallbackState = async (store: string): Promise<string | undefined> => {
  const migration = await git(store, ["log", "-1", "--format=%H", `--grep=${MIGRATE_SUBJECT}`]);
  return migration.ok && migration.out ? commitOf(store, `${migration.out}^`) : undefined;
};

export const readOrigin = async (store: string, source?: string): Promise<Origin> => {
  const recorded = await git(store, ["config", "--get", SOURCE_KEY]);
  const from = source ?? (recorded.ok ? recorded.out : undefined);
  if (!from) throw new TroveError("this store does not know its source: pass --source");
  const drop = (await git(store, ["config", "--get-all", DROP_KEY])).out
    .split("\n")
    .filter(Boolean);
  const state = (await commitOf(store, STATE_REF)) ?? (await fallbackState(store));
  if (!state) throw new TroveError("no record of the source state at migration");
  return { source: from, drop, state };
};

export const pendingState = (store: string): Promise<string | undefined> =>
  commitOf(store, PENDING_REF);
