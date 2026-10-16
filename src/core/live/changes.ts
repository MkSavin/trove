import { basename, join } from "node:path";
import type { Config } from "../config/schema.ts";
import { parseDocument } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { TroveError } from "../errors.ts";
import { git, gitOrThrow, toplevel } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { documentCell } from "../reports/cells.ts";
import { documentPath } from "../store/walk.ts";
import { compareNatural } from "../text/compare.ts";
import type { BlockSource } from "./git-data.ts";
import { startOf } from "./since.ts";

type Args = Readonly<Record<string, string>>;

/** The items as they were at the starting point; `before` is missing when there is none. */
export type Baseline = { before: readonly Item[] | undefined };

type Change = "closed" | "added" | "moved";

const ORDER: readonly Change[] = ["closed", "added", "moved"];

const LABEL = {
  closed: "changeClosed",
  added: "changeAdded",
  moved: "changeMoved",
} as const satisfies Record<Change, keyof Config["labels"]>;

export const changesKey = (rel: string, args: Args): string =>
  JSON.stringify([rel, args.since ?? "previous"]);

const paths = async (root: string, args: readonly string[]): Promise<string[]> =>
  (await gitOrThrow(root, args, { raw: true })).split("\0").filter(Boolean);

/** Unchanged documents are taken from the index; only the ones edited since are read from git. */
const itemsAt = async (index: StoreIndex, commit: string): Promise<Item[]> => {
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

export const loadChanges = async (
  index: StoreIndex,
  source: BlockSource,
  args: Args,
): Promise<Baseline> => {
  if (!(await toplevel(index.root)))
    throw new TroveError("trove:changes reads the store's git history: the store has none");
  const start = await startOf(index, source, args.since ?? "previous");
  if (!start) return { before: undefined };
  return { before: start.commit ? await itemsAt(index, start.commit) : [] };
};

const isOpen = (item: Item | undefined): item is Item => item !== undefined && !item.closed;

const changeOf = (then: Item | undefined, now: Item | undefined): Change | undefined => {
  if (isOpen(now)) {
    if (!isOpen(then)) return "added";
    return basename(then.document) === basename(now.document) ? undefined : "moved";
  }
  if (now === undefined) return isOpen(then) ? "closed" : undefined;
  return then === undefined || isOpen(then) ? "closed" : undefined;
};

/** A document that left its place, e.g. into the archive, is found again by its name. */
const currentRel = (index: StoreIndex, rel: string): string =>
  index.byRel.has(rel) ? rel : (index.byName.get(basename(rel))?.rel ?? rel);

/**
 * Items closed, added and moved to a document of another name since the baseline, as items with
 * a `change` value and, for moves, `from`.
 */
export const changeRows = (
  index: StoreIndex,
  baseline: readonly Item[],
  outputDir: string,
): Item[] => {
  const then = new Map(baseline.map((item) => [item.id, item]));
  const now = new Map(index.items.map((item) => [item.id, item]));
  return [...new Set([...then.keys(), ...now.keys()])]
    .flatMap((id) => {
      const before = then.get(id);
      const after = now.get(id);
      const change = changeOf(before, after);
      const item = after ?? before;
      if (!change || !item) return [];
      const from =
        change === "moved" && before
          ? { from: documentCell(currentRel(index, before.document), index, outputDir) }
          : {};
      const values = { ...item.values, change: index.config.labels[LABEL[change]], ...from };
      const document = currentRel(index, item.document);
      const closed = item.closed || change === "closed";
      return [{ change, item: { ...item, document, closed, values } }];
    })
    .toSorted(
      (a, b) =>
        ORDER.indexOf(a.change) - ORDER.indexOf(b.change) || compareNatural(a.item.id, b.item.id),
    )
    .map(({ item }) => item);
};
