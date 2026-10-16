import { existsSync } from "node:fs";
import type { Item } from "../document/ledger.ts";
import { gitSync } from "../git/git.ts";
import { isIsoDate } from "../text/dates.ts";
import { itemChecked } from "./checked.ts";
import { itemCodeRefs } from "./code-refs.ts";
import type { StoreIndex } from "./index.ts";
import { type CodeRef, type CodeRoot, rootKey } from "./links.ts";

export type Commit = { hash: string; date: string; files: readonly string[] };

/** An item that points at code, with the date or commit it was last checked at. */
export type Watched = { item: Item; since: string; refs: readonly CodeRef[] };

/** Missing when git cannot read the root, e.g. its ref or the checked commit is unknown here. */
type Logs = ReadonlyMap<string, readonly Commit[] | undefined>;

export type History = { items: ReadonlyMap<Item, Watched>; logs: Logs };

type LogRequest = { root: CodeRoot; paths: Set<string>; since: string };

export const HEAD = "HEAD";
/** Keeps each git command line well under the Windows limit. */
const PATHS_PER_CALL = 100;

export const chunks = <T>(values: readonly T[], size = PATHS_PER_CALL): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, i) =>
    values.slice(i * size, (i + 1) * size),
  );

/** A linked folder covers everything inside it. */
export const covers = (file: string, path: string): boolean =>
  file === path || file.startsWith(`${path}/`);

const watched = (index: StoreIndex): Watched[] =>
  index.items.flatMap((item) => {
    const doc = index.byRel.get(item.document);
    const since = doc && itemChecked(doc, item);
    if (!doc || since === undefined) return [];
    const refs = itemCodeRefs(index, doc, item);
    return refs.length > 0 ? [{ item, since, refs }] : [];
  });

/** Dates share one log per root, read from the earliest of them; each checked commit gets its own. */
const logKey = (root: CodeRoot, since: string): string =>
  isIsoDate(since) ? rootKey(root) : `${rootKey(root)}\0${since}`;

const range = (root: CodeRoot, since: string): string[] =>
  isIsoDate(since)
    ? [`--since=${since}T00:00:00`, root.ref ?? HEAD]
    : [`${since}..${root.ref ?? HEAD}`];

/** Each commit prints as `\0<hash> <date>` followed by the files it changed, relative to the root. */
const readLog = (out: string): Commit[] =>
  out.split("\0").flatMap((entry) => {
    const [head = "", ...files] = entry.split("\n").filter(Boolean);
    const [hash = "", date = ""] = head.split(" ");
    return hash ? [{ hash, date, files }] : [];
  });

const logAt = ({ root, paths, since }: LogRequest): Commit[] | undefined => {
  const commits = new Map<string, Commit>();
  for (const batch of chunks([...paths])) {
    const log = gitSync(root.dir, [
      "-c",
      "core.quotePath=false",
      "--literal-pathspecs",
      "log",
      "--format=%x00%H %cs",
      "--name-only",
      "--relative",
      ...range(root, since),
      "--",
      ...batch,
    ]);
    if (!log.ok) return undefined;
    for (const commit of readLog(log.out)) {
      const known = commits.get(commit.hash);
      commits.set(
        commit.hash,
        known ? { ...known, files: [...known.files, ...commit.files] } : commit,
      );
    }
  }
  return [...commits.values()];
};

const readLogs = (items: readonly Watched[]): Logs => {
  const requests = new Map<string, LogRequest>();
  for (const { since, refs } of items) {
    for (const { root, path } of refs) {
      if (!existsSync(root.dir)) continue;
      const key = logKey(root, since);
      const request = requests.get(key) ?? { root, paths: new Set<string>(), since };
      request.paths.add(path);
      if (since < request.since) request.since = since;
      requests.set(key, request);
    }
  }
  return new Map([...requests].map(([key, request]) => [key, logAt(request)]));
};

const histories = new WeakMap<StoreIndex, History>();

/** Read for the whole index on first use, so a store that never asks never runs git for it. */
export const codeHistory = (index: StoreIndex): History => {
  const known = histories.get(index);
  if (known) return known;
  const items = watched(index);
  const history = {
    items: new Map(items.map((entry) => [entry.item, entry])),
    logs: readLogs(items),
  };
  histories.set(index, history);
  return history;
};

/** Commits after the check that touched the reference; missing when they could not be read. */
export const commitsSince = (history: History, since: string, ref: CodeRef): Commit[] | undefined =>
  history.logs
    .get(logKey(ref.root, since))
    ?.filter(
      (commit) =>
        (!isIsoDate(since) || commit.date > since) &&
        commit.files.some((file) => covers(file, ref.path)),
    );
