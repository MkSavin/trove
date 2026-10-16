import type { Document } from "../document/document.ts";
import type { Verification } from "./cache.ts";
import { verifyCommandOf } from "./command.ts";

/** `ok 2026-10-16` or `failed 2026-10-16`; nothing when the command never ran here or changed since. */
export const lastVerified = (
  doc: Document,
  verified: ReadonlyMap<string, Verification>,
): string | undefined => {
  const last = verified.get(doc.rel);
  if (!last || last.command !== verifyCommandOf(doc)) return undefined;
  return `${last.ok ? "ok" : "failed"} ${last.date}`;
};
