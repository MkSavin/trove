import type { Item } from "../document/ledger.ts";
import { git } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { itemHeading } from "../index/resolve.ts";
import { currentRel, isLive } from "./item-state.ts";

/** A commit of the store and the day it was made. */
export type Base = { commit: string; date: string };

const NOTE = /\(([^()]*)\)\s*$/;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const COMMIT = /\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/;

export const baseOf = async (root: string, commit: string): Promise<Base> => ({
  commit,
  date: (await git(root, ["log", "-1", "--format=%cs", commit])).out,
});

/** The closing note on the item's heading, as `ledger.note` writes it. */
const closingNote = (index: StoreIndex, item: Item): string | undefined => {
  const doc = index.byRel.get(currentRel(index, item.document));
  const title = doc && itemHeading(doc, item.id)?.title;
  return title === undefined ? undefined : NOTE.exec(title)?.[1];
};

/** A commit of the store that the base does not contain; one the store lacks proves nothing. */
const laterCommit = async (root: string, commit: string, base: Base): Promise<boolean> =>
  (await git(root, ["cat-file", "-e", `${commit}^{commit}`])).ok &&
  !(await git(root, ["merge-base", "--is-ancestor", commit, base.commit])).ok;

const closedAfter = async (
  note: string,
  base: Base,
  isLater: (commit: string) => Promise<boolean>,
): Promise<boolean> => {
  const date = DATE.exec(note)?.[0];
  if (date !== undefined && date >= base.date) return true;
  const commit = COMMIT.exec(note)?.[0];
  return commit !== undefined && (await isLater(commit));
};

/**
 * Ids of items closed by `after` that were absent at the base and whose note proves they were
 * closed after it. Others, such as closed rows brought in later, did not close in between.
 */
export const closedSince = async (
  index: StoreIndex,
  before: readonly Item[],
  after: readonly Item[],
  base: Base,
): Promise<Set<string>> => {
  const known = new Set(before.map((item) => item.id));
  const fresh: readonly Item[] = after.filter(
    (item) => !known.has(item.id) && !isLive(item, index.config),
  );
  const checked = new Map<string, Promise<boolean>>();
  const isLater = (commit: string): Promise<boolean> => {
    const pending = checked.get(commit) ?? laterCommit(index.root, commit, base);
    checked.set(commit, pending);
    return pending;
  };
  const proven = await Promise.all(
    fresh.map((item) => closedAfter(closingNote(index, item) ?? "", base, isLater)),
  );
  return new Set(fresh.filter((_, i) => proven[i]).map((item) => item.id));
};
