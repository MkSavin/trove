import { TroveError } from "../errors.ts";
import { git } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { parseFrontMatter } from "../markdown/front-matter.ts";
import { compareText } from "../text/compare.ts";
import { isIsoDate } from "../text/dates.ts";
import { splitLines } from "../text/lines.ts";
import type { BlockSource } from "./git-data.ts";

/** The store's commit to compare with; `undefined` when the point lies before its history. */
export type Start = { commit: string | undefined };

const PREVIOUS = "previous";

const firstLine = (text: string): string | undefined => text.split("\n").find(Boolean);

/** The last commit before the day begins. */
const commitBefore = async (root: string, date: string): Promise<Start> => {
  const found = await git(root, ["rev-list", "-1", `--before=${date}T00:00:00`, "HEAD"]);
  return { commit: found.ok ? firstLine(found.out) : undefined };
};

const addedIn = async (root: string, rel: string): Promise<string | undefined> =>
  firstLine(
    (await git(root, ["log", "--follow", "--diff-filter=A", "--format=%H", "--", rel])).out,
  );

const order = (date: string | undefined, rel: string): string => `${date ?? ""}\0${rel}`;

/** The summary of the same kind written last before this one. */
const previousSummary = (index: StoreIndex, source: BlockSource) => {
  const fields = parseFrontMatter(splitLines(source.text))?.fields;
  const kind = fields?.get("kind")?.value;
  if (!kind)
    throw new TroveError("since=previous needs a summary with a kind: give since=<date|commit>");
  const own = order(fields?.get("date")?.value ?? index.today, source.rel);
  return index.documents
    .filter((doc) => doc.meta.kind === kind && order(doc.meta.date, doc.rel) < own)
    .toSorted((a, b) => compareText(order(a.meta.date, a.rel), order(b.meta.date, b.rel)))
    .at(-1);
};

/** `since=previous|<date>|<commit>`; nothing when there is no previous summary to start from. */
export const startOf = async (
  index: StoreIndex,
  source: BlockSource,
  since: string,
): Promise<Start | undefined> => {
  if (since === PREVIOUS) {
    const previous = previousSummary(index, source);
    if (!previous) return undefined;
    const commit = await addedIn(index.root, previous.rel);
    return commit ? { commit } : commitBefore(index.root, previous.meta.date ?? index.today);
  }
  if (isIsoDate(since)) return commitBefore(index.root, since);
  const found = await git(index.root, ["rev-parse", "--verify", "--quiet", `${since}^{commit}`]);
  if (!found.ok)
    throw new TroveError(`since=${since}: give previous, a date or a commit of the store`);
  return { commit: found.out };
};
