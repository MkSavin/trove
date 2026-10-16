import { existsSync } from "node:fs";
import { gitSync } from "../git/git.ts";
import { isIsoDate } from "../text/dates.ts";
import type { StoreIndex } from "./index.ts";
import type { CodeRef } from "./links.ts";

const days = new WeakMap<StoreIndex, Map<string, string | undefined>>();

const commitDay = (dir: string, commit: string): string | undefined => {
  if (!existsSync(dir)) return undefined;
  const shown = gitSync(dir, ["log", "-1", "--format=%cs", commit]);
  return shown.ok && isIsoDate(shown.out) ? shown.out : undefined;
};

/** A checked date as it is; a checked commit by the day it was made, in a root the item points into. */
export const checkedDay = (
  index: StoreIndex,
  since: string,
  refs: readonly CodeRef[],
): string | undefined => {
  if (isIsoDate(since)) return since;
  const cache = days.get(index) ?? new Map<string, string | undefined>();
  days.set(index, cache);
  for (const dir of new Set(refs.map((ref) => ref.root.dir))) {
    const key = `${dir}\0${since}`;
    if (!cache.has(key)) cache.set(key, commitDay(dir, since));
    const day = cache.get(key);
    if (day) return day;
  }
  return undefined;
};
