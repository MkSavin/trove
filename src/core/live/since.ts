import { posix } from "node:path";
import type { Document } from "../document/document.ts";
import { splitRefs } from "../document/refs.ts";
import { TroveError } from "../errors.ts";
import { git } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { findDocument } from "../index/resolve.ts";
import { parseFrontMatter } from "../markdown/front-matter.ts";
import { compareText } from "../text/compare.ts";
import { isIsoDate } from "../text/dates.ts";
import { splitLines } from "../text/lines.ts";
import type { BlockSource } from "./git-data.ts";

/** The store's commit to compare with; `undefined` when the point lies before its history. */
export type Start = { commit: string | undefined };

const PREVIOUS = "previous";

const firstLine = (text: string): string | undefined => text.split("\n").find(Boolean);

/**
 * The last commit of the main line before the day begins. A merged branch's older commit lacks
 * what the main line had then, so it never counts.
 */
export const commitBefore = async (root: string, date: string): Promise<Start> => {
  const found = await git(root, [
    "rev-list",
    "-1",
    "--first-parent",
    `--before=${date}T00:00:00`,
    "HEAD",
  ]);
  return { commit: found.ok ? firstLine(found.out) : undefined };
};

/**
 * The commit that first added a file of this name, wherever it was then. Renames are not followed:
 * git would take a new summary for its predecessor renamed.
 */
const addedIn = async (root: string, rel: string): Promise<string | undefined> => {
  const pathspec = `:(glob)**/${posix.basename(rel)}`;
  const added = await git(root, [
    "log",
    "--no-renames",
    "--diff-filter=A",
    "--format=%H",
    "--",
    pathspec,
  ]);
  return added.out.split("\n").filter(Boolean).at(-1);
};

const order = (doc: Document): string => `${doc.meta.date ?? ""}\0${doc.rel}`;

const latest = (docs: readonly Document[]): Document | undefined =>
  docs.toSorted((a, b) => compareText(order(a), order(b))).at(-1);

/**
 * The summary this one replaced, named by `supersedes` or `superseded_by`; else the latest of the
 * same kind dated before it, so a sibling written the same day never counts.
 */
const previousSummary = (index: StoreIndex, source: BlockSource): Document | undefined => {
  const fields = parseFrontMatter(splitLines(source.text))?.fields;
  const kind = fields?.get("kind")?.value;
  if (!kind)
    throw new TroveError("since=previous needs a summary with a kind: give since=<date|commit>");
  const date = fields?.get("date")?.value ?? index.today;
  const name = posix.basename(source.rel);
  const names = new Set([name, name.replace(/\.md$/, "")]);
  const supersedes = new Set(
    splitRefs(fields?.get("supersedes")?.value ?? "").map((ref) => findDocument(index, ref)?.rel),
  );
  const others = index.documents.filter((doc) => doc.meta.kind === kind && doc.rel !== source.rel);
  const replaced = others.filter(
    (doc) =>
      supersedes.has(doc.rel) ||
      splitRefs(doc.meta.superseded_by ?? "").some((ref) => names.has(posix.basename(ref))),
  );
  return latest(replaced) ?? latest(others.filter((doc) => (doc.meta.date ?? "") < date));
};

/** A start with the date or commit it stands for, as notes name it. */
export type StartPoint = Start & { on: string };

/** `since=previous|<date>|<commit>`; nothing when there is no previous summary to start from. */
export const startOf = async (
  index: StoreIndex,
  source: BlockSource,
  since: string,
): Promise<StartPoint | undefined> => {
  if (since === PREVIOUS) {
    const previous = previousSummary(index, source);
    if (!previous) return undefined;
    const on = previous.meta.date ?? index.today;
    const commit = await addedIn(index.root, previous.rel);
    return commit ? { commit, on } : { ...(await commitBefore(index.root, on)), on };
  }
  if (isIsoDate(since)) return { ...(await commitBefore(index.root, since)), on: since };
  const found = await git(index.root, ["rev-parse", "--verify", "--quiet", `${since}^{commit}`]);
  if (!found.ok)
    throw new TroveError(`since=${since}: give previous, a date or a commit of the store`);
  return { commit: found.out, on: since };
};
