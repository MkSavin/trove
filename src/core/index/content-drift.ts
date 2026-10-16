import type { Item } from "../document/ledger.ts";
import { touches } from "../git/hunks.ts";
import { codeHistory, commitsSince, covers } from "./history.ts";
import type { StoreIndex } from "./index.ts";
import { type Hunks, hunksSince } from "./line-diff.ts";
import { type CodeRef, rootKey } from "./links.ts";

const changedIn = (hunks: Hunks | undefined, { path, lines }: CodeRef): boolean | undefined =>
  hunks &&
  [...hunks].some(
    ([file, fileHunks]) =>
      covers(file, path) && fileHunks.some((hunk) => !lines || touches(hunk, lines)),
  );

/** The code the item points at reads as at its check, whitespace aside; false when unsure. */
export const unchangedInContent = (index: StoreIndex, item: Item): boolean => {
  const history = codeHistory(index);
  const watched = history.items.get(item);
  if (!watched) return false;
  const { since, refs } = watched;
  const touched: CodeRef[] = [];
  for (const ref of refs) {
    const commits = commitsSince(history, since, ref);
    if (!commits) return false;
    if (commits.length > 0) touched.push(ref);
  }
  const roots = Map.groupBy(touched, (ref) => rootKey(ref.root));
  const unchanged = [...roots.values()].every((group) => {
    const [first] = group;
    if (!first) return true;
    const paths = new Set(group.map((ref) => ref.path));
    const check = { root: first.root, since, paths };
    const hunks = hunksSince(history.reads, check, { ignoreSpace: true });
    return group.every((ref) => changedIn(hunks, ref) === false);
  });
  history.reads.memo.save();
  return unchanged;
};
