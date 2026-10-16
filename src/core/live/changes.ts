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
import { movedOut } from "./moved-out.ts";
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

/** The change values in the order rows come in. */
export const changeLabels = (config: Config): string[] =>
  ORDER.map((change) => config.labels[LABEL[change]]);

type Row = { change: Change; item: Item; from: string | undefined; to: string | undefined };

/** An item closed as moved counts as moved, shown where its new id lives when that is found. */
const rowOf = (
  index: StoreIndex,
  before: Item | undefined,
  after: Item | undefined,
  now: ReadonlyMap<string, Item>,
): Row | undefined => {
  const found = changeOf(before, after);
  const item = after ?? before;
  if (!found || !item) return undefined;
  const from = before && currentRel(index, before.document);
  const moved =
    found === "closed" && before && from ? movedOut(index, before, after, from) : undefined;
  const change = moved ? "moved" : found;
  const target = moved?.to === undefined ? undefined : now.get(moved.to);
  const document = currentRel(index, target?.document ?? item.document);
  const closed = item.closed || found === "closed";
  return {
    change,
    item: { ...item, document, closed },
    from: change === "moved" ? from : undefined,
    to: moved?.to,
  };
};

/**
 * Items closed, added and moved since the baseline, as items with a `change` value and, for
 * moves, `from` and, when the item took a new id, `to`; that new id is not listed as added.
 */
export const changeRows = (
  index: StoreIndex,
  baseline: readonly Item[],
  outputDir: string,
): Item[] => {
  const then = new Map(baseline.map((item) => [item.id, item]));
  const now = new Map(index.items.map((item) => [item.id, item]));
  const rows = [...new Set([...then.keys(), ...now.keys()])].flatMap((id) => {
    const row = rowOf(index, then.get(id), now.get(id), now);
    return row ? [row] : [];
  });
  const targets = new Set(rows.map((row) => row.to));
  return rows
    .filter((row) => row.change !== "added" || !targets.has(row.item.id))
    .toSorted(
      (a, b) =>
        ORDER.indexOf(a.change) - ORDER.indexOf(b.change) || compareNatural(a.item.id, b.item.id),
    )
    .map(({ change, item, from, to }) => {
      const values = {
        ...item.values,
        change: index.config.labels[LABEL[change]],
        ...(from === undefined ? {} : { from: documentCell(from, index, outputDir) }),
        ...(to === undefined ? {} : { to }),
      };
      return { ...item, values };
    });
};
