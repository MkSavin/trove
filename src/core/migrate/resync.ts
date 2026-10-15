import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { CONFIG_FILE } from "../config/load.ts";
import { TroveError } from "../errors.ts";
import { git, gitOrThrow } from "../git/git.ts";
import { writeReports } from "../reports/write.ts";
import { openStore, type Store } from "../store/open.ts";
import { commitPaths } from "../sync/git-steps.ts";
import { asEditOf, type Change, type Move, pairMoves } from "./moves.ts";
import { PENDING_REF, pendingState, readOrigin, recordOrigin, STATE_REF } from "./origin.ts";
import { snapshotSource } from "./snapshot.ts";

export type FileResult = {
  path: string;
  outcome: "applied" | "moved" | "conflict" | "skipped";
  detail?: string | undefined;
};

export type Resynced = {
  source: string;
  files: readonly FileResult[];
  /** Missing when nothing changed or conflicts wait for a person. */
  commit: string | undefined;
  upToDate: boolean;
};

const CONFLICT = /^<{7} /m;
const QUIET = ["-c", "core.quotePath=false"];

/** Where the store keeps a source path now: in place, or moved into the archive mirror. */
const locate = (store: Store, path: string): string | undefined => {
  if (existsSync(join(store.root, path))) return path;
  const archived = `${store.config.archive.folder}/${path}`;
  return existsSync(join(store.root, archived)) ? archived : undefined;
};

const changesBetween = async (store: string, from: string, to: string): Promise<Change[]> => {
  const fields = (
    await gitOrThrow(store, [...QUIET, "diff", "--no-renames", "--name-status", "-z", from, to], {
      raw: true,
    })
  )
    .split("\0")
    .filter(Boolean);
  const changes: Change[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    changes.push({ status: fields[i] ?? "", path: fields[i + 1] ?? "" });
  }
  return changes;
};

const hasMarkers = async (root: string, path: string): Promise<boolean> =>
  existsSync(join(root, path)) && CONFLICT.test(await Bun.file(join(root, path)).text());

const retarget = (patch: string, from: string, to: string): string =>
  from === to ? patch : patch.replaceAll(`a/${from}`, `a/${to}`).replaceAll(`b/${from}`, `b/${to}`);

const applyPatch = async (
  store: Store,
  patch: string,
  target: string,
  result: FileResult,
): Promise<FileResult> => {
  if (patch === "") return result;
  const file = join(tmpdir(), `trove-resync-${process.pid}-${Date.now()}.patch`);
  try {
    await Bun.write(file, patch);
    const applied = await git(store.root, ["apply", "--3way", "--whitespace=nowarn", file]);
    if (applied.ok) return result;
    const marked = await hasMarkers(store.root, target);
    return { path: result.path, outcome: "conflict", detail: marked ? undefined : applied.err };
  } finally {
    await rm(file, { force: true });
  }
};

const applyOne = async (
  store: Store,
  base: string,
  now: string,
  path: string,
): Promise<FileResult> => {
  const target = locate(store, path) ?? path;
  const patch = await gitOrThrow(
    store.root,
    [...QUIET, "diff", "--binary", base, now, "--", path],
    { raw: true },
  );
  const deleted = !(await git(store.root, ["cat-file", "-e", `${now}:${path}`])).ok;
  if (deleted && !locate(store, path)) return { path, outcome: "skipped", detail: "already gone" };
  const shown = target === path ? path : `${path} → ${target}`;
  return applyPatch(store, retarget(patch, path, target), target, {
    path: shown,
    outcome: "applied",
  });
};

/** The store follows a move the source made across the archive mirror, keeping its own edits. */
const applyMove = async (
  store: Store,
  base: string,
  now: string,
  { from, to }: Move,
): Promise<FileResult> => {
  const path = `${from} → ${to}`;
  const movedAlready = existsSync(join(store.root, to));
  if (!movedAlready && !existsSync(join(store.root, from))) {
    return { path, outcome: "skipped", detail: "gone from the store" };
  }
  if (!movedAlready) {
    await mkdir(dirname(join(store.root, to)), { recursive: true });
    await gitOrThrow(store.root, ["mv", from, to]);
  }
  const patch = await gitOrThrow(
    store.root,
    [...QUIET, "diff", "--binary", `${base}:${from}`, `${now}:${to}`],
    { raw: true },
  );
  return applyPatch(store, patch && asEditOf(patch, to), to, { path, outcome: "moved" });
};

const rebuildAndCommit = async (
  store: Store,
  source: string,
  state: string,
): Promise<string | undefined> => {
  const reopened = await openStore({ cwd: store.root, store: store.root });
  await writeReports(reopened.index, Object.keys(reopened.config.reports));
  const committed = await commitPaths(store.root, "all", `docs: resync from ${basename(source)}`);
  if (committed.error) throw new TroveError(`resync applied but not committed: ${committed.error}`);
  await gitOrThrow(store.root, ["update-ref", STATE_REF, state]);
  await git(store.root, ["update-ref", "-d", PENDING_REF]);
  return committed.sha;
};

/**
 * Brings what changed in the source since the last migration or resync into the store, three-way,
 * so the store's own edits survive. Old tooling, generated reports and the config stay the store's.
 */
export const resyncStore = async (store: Store, source?: string): Promise<Resynced> => {
  if (await pendingState(store.root)) {
    throw new TroveError(
      "a resync waits for conflicts: resolve them, then trove resync --continue",
    );
  }
  if ((await git(store.root, ["status", "--porcelain"])).out !== "") {
    throw new TroveError("the store has uncommitted changes: commit or sync them first");
  }
  const origin = await readOrigin(store.root, source);
  const now = await snapshotSource(origin.source, store.root);
  const keep = new Set([
    CONFIG_FILE,
    ...origin.drop,
    ...Object.values(store.config.reports).map((report) => report.output),
  ]);
  const changes = (await changesBetween(store.root, origin.state, now)).filter(
    (change) => !keep.has(change.path),
  );
  if (changes.length === 0) {
    await gitOrThrow(store.root, ["update-ref", STATE_REF, now]);
    return { source: origin.source, files: [], commit: undefined, upToDate: true };
  }

  const { moves, rest } = pairMoves(changes, store.config.archive.folder);
  const files: FileResult[] = [];
  for (const move of moves) files.push(await applyMove(store, origin.state, now, move));
  for (const path of rest) files.push(await applyOne(store, origin.state, now, path));
  if (files.some((file) => file.outcome === "conflict")) {
    await gitOrThrow(store.root, ["update-ref", PENDING_REF, now]);
    return { source: origin.source, files, commit: undefined, upToDate: false };
  }
  const commit = await rebuildAndCommit(store, origin.source, now);
  await recordOrigin(store.root, origin.source, origin.drop, now);
  return { source: origin.source, files, commit, upToDate: false };
};

/** Finishes a resync once no file holds conflict markers any more. */
export const continueResync = async (store: Store): Promise<Resynced> => {
  const pending = await pendingState(store.root);
  if (!pending) throw new TroveError("no resync is waiting");
  const origin = await readOrigin(store.root);
  const touched = (await gitOrThrow(store.root, ["diff", "--name-only", "HEAD"]))
    .split("\n")
    .filter(Boolean);
  const marked = await Promise.all(touched.map((path) => hasMarkers(store.root, path)));
  const left = touched.filter((_, i) => marked[i]);
  if (left.length > 0) throw new TroveError(`conflict markers left in ${left.join(", ")}`);
  const commit = await rebuildAndCommit(store, origin.source, pending);
  return { source: origin.source, files: [], commit, upToDate: false };
};
