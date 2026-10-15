import { TroveError } from "../errors.ts";
import type { Filters } from "./query.ts";

const PAIR = /([\w.-]+)=("([^"]*)"|\S+)/g;

/** `owner=web,api title="Open items"` → `{ owner: "web,api", title: "Open items" }`. */
export const parseArguments = (text: string): Record<string, string> =>
  Object.fromEntries(
    [...text.matchAll(PAIR)].map((match) => [match[1] ?? "", match[3] ?? match[2] ?? ""]),
  );

/** `status=open,deferred path=!audits/mobile/**` → `{ status: ["open", "deferred"], path: [...] }`; repeats add up. */
export const parseFilters = (pairs: readonly string[]): Record<string, string[]> =>
  pairs.reduce<Record<string, string[]>>((filters, pair) => {
    const at = pair.indexOf("=");
    if (at <= 0) throw new TroveError(`filter must read field=value[,value]: ${pair}`);
    const field = pair.slice(0, at);
    filters[field] = [...(filters[field] ?? []), ...pair.slice(at + 1).split(",")];
    return filters;
  }, {});

/** The same filters written on one line, as a document's `filter:` header field holds them. */
export const parseFilterText = (text: string | undefined): Record<string, string[]> =>
  parseFilters((text ?? "").split(/\s+/).filter(Boolean));

export const mergeFilters = (...all: readonly Filters[]): Record<string, string[]> =>
  all.reduce<Record<string, string[]>>((merged, filters) => {
    for (const [field, values] of Object.entries(filters)) {
      merged[field] = [...(merged[field] ?? []), ...values];
    }
    return merged;
  }, {});
