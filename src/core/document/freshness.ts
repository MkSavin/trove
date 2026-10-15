import type { Config } from "../config/schema.ts";
import { hasCapability } from "../config/vocabulary.ts";
import { daysBetween, isIsoDate } from "../text/dates.ts";
import type { Document } from "./document.ts";

/** Days since `checked` when that exceeds the type's limit; archived documents never go stale. */
export const staleDays = (doc: Document, config: Config, now: string): number | undefined => {
  const checked = doc.meta.checked;
  if (doc.place !== "work" || !hasCapability(doc.typeConfig, "freshness")) return undefined;
  if (checked === undefined || !isIsoDate(checked)) return undefined;

  const age = daysBetween(checked, now);
  const limit = doc.typeConfig?.freshness ?? config.freshness.default;
  return age > limit ? age : undefined;
};
