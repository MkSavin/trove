import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { Document } from "../document/document.ts";
import type { Item } from "../document/ledger.ts";
import { gitSync } from "../git/git.ts";
import { isIsoDate } from "../text/dates.ts";
import type { StoreIndex } from "./index.ts";
import { type CodeRoot, codeRoot, linkTarget } from "./links.ts";
import { itemHeading } from "./resolve.ts";

type CodeLink = { root: CodeRoot; path: string };

type Watched = { item: Item; since: string; links: readonly CodeLink[] };

/** Changed file → the date of its latest change. */
type Changes = ReadonlyMap<string, string>;

const HEAD = "HEAD";
/** Keeps each git command line well under the Windows limit. */
const PATHS_PER_CALL = 100;

const rootKey = ({ dir, ref }: CodeRoot): string => `${dir}\0${ref ?? HEAD}`;

/** Pinned links point at a past commit on purpose, so later changes are not drift. */
const sectionCodeLinks = (index: StoreIndex, doc: Document, item: Item): CodeLink[] => {
  const heading = itemHeading(doc, item.id);
  if (!heading) return [];
  return doc.links
    .filter((link) => !link.pin && link.start >= heading.start && link.start < heading.end)
    .flatMap((link) => {
      const absolute = resolve(index.root, linkTarget(doc, link));
      const root = codeRoot(index, absolute);
      const path = root ? relative(root.dir, absolute).split(sep).join("/") : "";
      return root && path && existsSync(root.dir) ? [{ root, path }] : [];
    });
};

const watched = (index: StoreIndex): Watched[] =>
  index.items.flatMap((item) => {
    const doc = index.byRel.get(item.document);
    const since = doc?.meta.checked;
    if (!doc || since === undefined || !isIsoDate(since)) return [];
    const links = sectionCodeLinks(index, doc, item);
    return links.length > 0 ? [{ item, since, links }] : [];
  });

const chunks = <T>(values: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, i) =>
    values.slice(i * size, (i + 1) * size),
  );

/** Each commit prints as `\0<date>` followed by the files it changed, relative to the root. */
const readLog = (out: string, into: Map<string, string>): void => {
  for (const commit of out.split("\0")) {
    const [date = "", ...files] = commit.split("\n").filter(Boolean);
    for (const file of files) {
      if ((into.get(file) ?? "") < date) into.set(file, date);
    }
  }
};

const changesAt = (root: CodeRoot, paths: readonly string[], since: string): Changes => {
  const changes = new Map<string, string>();
  for (const batch of chunks(paths, PATHS_PER_CALL)) {
    const log = gitSync(root.dir, [
      "-c",
      "core.quotePath=false",
      "--literal-pathspecs",
      "log",
      `--since=${since}T00:00:00`,
      "--format=%x00%cs",
      "--name-only",
      "--relative",
      root.ref ?? HEAD,
      "--",
      ...batch,
    ]);
    if (log.ok) readLog(log.out, changes);
  }
  return changes;
};

/** One git log per code root, from the earliest `checked` date of the items linking into it. */
const changesByRoot = (items: readonly Watched[]): ReadonlyMap<string, Changes> => {
  const roots = new Map<string, { root: CodeRoot; paths: Set<string>; since: string }>();
  for (const { since, links } of items) {
    for (const { root, path } of links) {
      const key = rootKey(root);
      const entry = roots.get(key) ?? { root, paths: new Set<string>(), since };
      entry.paths.add(path);
      if (since < entry.since) entry.since = since;
      roots.set(key, entry);
    }
  }
  return new Map(
    [...roots].map(([key, { root, paths, since }]) => [key, changesAt(root, [...paths], since)]),
  );
};

/** A linked folder drifts when anything inside it changed. */
const changedAfter = (changes: Changes | undefined, path: string, since: string): boolean =>
  [...(changes ?? [])].some(
    ([file, date]) => date > since && (file === path || file.startsWith(`${path}/`)),
  );

const findDrifts = (index: StoreIndex): ReadonlyMap<Item, readonly string[]> => {
  const items = watched(index);
  const changes = changesByRoot(items);
  return new Map(
    items.flatMap(({ item, since, links }) => {
      const files = links
        .filter(({ root, path }) => changedAfter(changes.get(rootKey(root)), path, since))
        .map(({ path }) => path);
      return files.length > 0 ? [[item, [...new Set(files)]]] : [];
    }),
  );
};

const drifts = new WeakMap<StoreIndex, ReadonlyMap<Item, readonly string[]>>();

/**
 * Code files the item's own section links to that changed after its document's `checked` date.
 * Computed for the whole index on first use, so a store that never asks never runs git for it.
 */
export const driftedFiles = (index: StoreIndex, item: Item): readonly string[] | undefined => {
  const known = drifts.get(index) ?? findDrifts(index);
  drifts.set(index, known);
  return known.get(item);
};
