import { join } from "node:path";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { splitLines } from "../text/lines.ts";
import { findLiveBlocks } from "./blocks.ts";
import { type BranchTable, branchesKey, loadBranches } from "./branches.ts";
import { type Baseline, changesKey, loadChanges } from "./changes.ts";
import { isSnapshot } from "./snapshot.ts";

export type Fact<T> = { value: T } | { problem: string };

/** What blocks that read git need, read once before filling: by `branchesKey` and `changesKey`. */
export type GitData = {
  branches: ReadonlyMap<string, Fact<BranchTable>>;
  changes: ReadonlyMap<string, Fact<Baseline>>;
};

export type BlockSource = { rel: string; text: string };

const GIT_VIEW = /<!--\s*trove:(branches|changes)\b/;

/** Nothing when the data is not there to show; a thrown problem when it could not be read. */
export const loaded = <T>(fact: Fact<T> | undefined): { value: T } | undefined => {
  if (fact && "problem" in fact) throw new TroveError(fact.problem);
  return fact;
};

const settle = async <T>(load: Promise<T | undefined>): Promise<Fact<T> | undefined> => {
  try {
    const value = await load;
    return value === undefined ? undefined : { value };
  } catch (error) {
    if (error instanceof TroveError) return { problem: error.message };
    throw error;
  }
};

const settled = async <T>(
  pending: ReadonlyMap<string, Promise<Fact<T> | undefined>>,
): Promise<Map<string, Fact<T>>> => {
  const entries = await Promise.all(
    [...pending].map(async ([key, fact]) => [key, await fact] as const),
  );
  return new Map(
    entries.flatMap(([key, fact]): [string, Fact<T>][] => (fact ? [[key, fact]] : [])),
  );
};

/** Reads git only for the blocks the sources hold; blocks with the same key share one read. */
export const loadGitData = async (
  index: StoreIndex,
  sources: readonly BlockSource[],
): Promise<GitData> => {
  const branches = new Map<string, Promise<Fact<BranchTable> | undefined>>();
  const changes = new Map<string, Promise<Fact<Baseline> | undefined>>();
  for (const source of sources.filter((candidate) => GIT_VIEW.test(candidate.text))) {
    for (const { view, args, close } of findLiveBlocks(splitLines(source.text))) {
      if (!close) continue;
      if (view === "branches" && !branches.has(branchesKey(args)))
        branches.set(branchesKey(args), settle(loadBranches(index, args)));
      const key = changesKey(source.rel, args);
      if (view === "changes" && !changes.has(key))
        changes.set(key, settle(loadChanges(index, source, args)));
    }
  }
  return { branches: await settled(branches), changes: await settled(changes) };
};

const merge = (first: GitData | undefined, second: GitData): GitData => ({
  branches: new Map([...(first?.branches ?? []), ...second.branches]),
  changes: new Map([...(first?.changes ?? []), ...second.changes]),
});

/** The index with git data for these sources too, e.g. a summary not written yet. */
export const withGitData = async (
  index: StoreIndex,
  sources: readonly BlockSource[],
): Promise<StoreIndex> => ({
  ...index,
  gitData: merge(index.gitData, await loadGitData(index, sources)),
});

/** Every text whose blocks a report run refills: documents that are not snapshots, and regulation files. */
const refilled = async (index: StoreIndex): Promise<BlockSource[]> => {
  const outside = index.config.regulationFiles.filter((rel) => !index.byRel.has(rel));
  const files = await Promise.all(
    outside.map(async (rel) => {
      const file = Bun.file(join(index.root, rel));
      return (await file.exists()) ? [{ rel, text: await file.text() }] : [];
    }),
  );
  return [...index.documents.filter((doc) => !isSnapshot(doc, index)), ...files.flat()];
};

export const withStoreGitData = async (index: StoreIndex): Promise<StoreIndex> =>
  withGitData(index, await refilled(index));
