import { join } from "node:path";
import { parseDocument } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { git, gitOrThrow } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { documentPath } from "../store/walk.ts";

const paths = async (root: string, args: readonly string[]): Promise<string[]> =>
  (await gitOrThrow(root, args, { raw: true })).split("\0").filter(Boolean);

/** Ledger items at a commit. Unchanged documents come from the index; edited ones from git. */
export const itemsAt = async (index: StoreIndex, commit: string): Promise<Item[]> => {
  const isDocument = documentPath(index.config);
  const then = (await paths(index.root, ["ls-tree", "-r", "-z", "--name-only", commit])).filter(
    isDocument,
  );
  const edited = new Set(
    await paths(index.root, ["diff", "-z", "--name-only", "--no-renames", "--relative", commit]),
  );
  const documents = await Promise.all(
    then.map(async (rel) => {
      const current = index.byRel.get(rel);
      if (current && !edited.has(rel)) return current;
      const text = (await git(index.root, ["show", `${commit}:./${rel}`], { raw: true })).out;
      return parseDocument({ path: join(index.root, rel), rel, text }, index.config);
    }),
  );
  return documents.flatMap((doc) => doc.ledger?.items ?? []);
};
