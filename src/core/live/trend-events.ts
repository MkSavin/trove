import { basename } from "node:path";
import type { Item } from "../document/ledger.ts";
import type { StoreIndex } from "../index/index.ts";
import { currentRel, isLive } from "./item-state.ts";
import { movedOut } from "./moved-out.ts";

export type TrendKind = "opened" | "closed" | "moved";

/** For a move, `item` is where it was and `target` where it went, when that is known. */
export type TrendEvent = { kind: TrendKind; item: Item; target: Item | undefined };

const leftAs = (
  index: StoreIndex,
  item: Item,
  now: Item | undefined,
  all: ReadonlyMap<string, Item>,
): TrendEvent | undefined => {
  const { config } = index;
  if (isLive(now, config))
    return basename(now.document) === basename(item.document)
      ? undefined
      : { kind: "moved", item, target: now };
  const out = movedOut(index, item, now, currentRel(index, item.document));
  if (!out) return { kind: "closed", item, target: undefined };
  const target = out.to === undefined ? undefined : all.get(out.to);
  return { kind: "moved", item, target: isLive(target, config) ? target : undefined };
};

/**
 * What happened between two snapshots. An item moved to a document of another name, or closed as
 * moved, counts once as moved; its new id is not counted as opened.
 */
export const weekEvents = (
  index: StoreIndex,
  before: readonly Item[],
  after: readonly Item[],
): TrendEvent[] => {
  const live = (item: Item) => isLive(item, index.config);
  const then = new Map(before.filter(live).map((item) => [item.id, item]));
  const all = new Map(after.map((item) => [item.id, item]));
  const left = [...then.values()].flatMap((item): TrendEvent[] => {
    const event = leftAs(index, item, all.get(item.id), all);
    return event ? [event] : [];
  });
  const targets = new Set(left.map((event) => event.target?.id));
  const opened = after
    .filter((item) => live(item) && !then.has(item.id) && !targets.has(item.id))
    .map((item): TrendEvent => ({ kind: "opened", item, target: undefined }));
  return [...left, ...opened];
};

/** The item an event counts as under the filters: where it was, else where it went. */
export const eventSubject = (
  event: TrendEvent,
  matches: (item: Item) => boolean,
): Item | undefined => {
  if (matches(event.item)) return event.item;
  return event.target && matches(event.target) ? event.target : undefined;
};
