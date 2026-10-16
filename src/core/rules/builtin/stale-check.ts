import type { Document } from "../../document/document.ts";
import type { Item } from "../../document/ledger.ts";
import { itemChecked } from "../../index/checked.ts";
import { checkedDay } from "../../index/checked-day.ts";
import { itemCodeRefs } from "../../index/code-refs.ts";
import { codeHistory, commitsSince } from "../../index/history.ts";
import type { StoreIndex } from "../../index/index.ts";
import { daysBetween } from "../../text/dates.ts";
import { defineRule, type Finding } from "../rule.ts";

const ID = "stale-check";
const DEFAULT_DAYS = 30;

const commitsAfter = (index: StoreIndex, item: Item): number => {
  const history = codeHistory(index);
  const watched = history.items.get(item);
  if (!watched) return 0;
  const hashes = watched.refs.flatMap(
    (ref) => commitsSince(history, watched.since, ref)?.map((commit) => commit.hash) ?? [],
  );
  return new Set(hashes).size;
};

const itemFindings = (
  index: StoreIndex,
  doc: Document,
  item: Item,
  limits: { days: number; commits: number | undefined },
): Finding[] => {
  const since = itemChecked(doc, item);
  if (since === undefined) return [];
  const day = checkedDay(index, since, itemCodeRefs(index, doc, item));
  const age = day === undefined ? 0 : daysBetween(day, index.today);
  const commits = limits.commits === undefined ? 0 : commitsAfter(index, item);
  return [
    ...(age > limits.days ? [`${item.id} not checked for ${age} days`] : []),
    ...(limits.commits !== undefined && commits >= limits.commits
      ? [`the code of ${item.id} changed in ${commits} commit(s) since its check`]
      : []),
  ].map((message) => ({ line: item.line, message }));
};

export const staleCheck = defineRule({
  id: ID,
  level: "off",
  summary:
    "An open item is re-checked within `limit` days (30 by default) and, with `commits` set, before that many commits touch the code it points at.",
  scope: "document",
  check: (doc, { config, index }) => {
    if (doc.place !== "work") return [];
    const setting = config.rules[ID];
    const limits = { days: setting?.limit ?? DEFAULT_DAYS, commits: setting?.commits };
    return (doc.ledger?.items ?? [])
      .filter((item) => item.open && !item.closed)
      .flatMap((item) => itemFindings(index, doc, item, limits));
  },
});
