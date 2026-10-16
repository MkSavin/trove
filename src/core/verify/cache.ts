import { join } from "node:path";
import { z } from "zod";
import { compareText } from "../text/compare.ts";

const verification = z.object({
  ok: z.boolean(),
  /** Local date of the run, as the `verified` column shows it. */
  date: z.string(),
  at: z.string(),
  /** The command as written in the header: a changed command makes the old result void. */
  command: z.string(),
});

export type Verification = z.infer<typeof verification>;

const cacheFile = z.object({ documents: z.record(z.string(), verification) });

export const verifyCachePath = (root: string): string =>
  join(root, ".trove", "cache", "verify.json");

/** The last result per document; empty when nothing ran here or the file is unreadable. */
export const readVerifications = async (root: string): Promise<Map<string, Verification>> => {
  const file = Bun.file(verifyCachePath(root));
  if (!(await file.exists())) return new Map();
  try {
    return new Map(Object.entries(cacheFile.parse(await file.json()).documents));
  } catch {
    return new Map();
  }
};

/** Merges new results in and drops documents that are gone. */
export const writeVerifications = async (
  root: string,
  results: ReadonlyMap<string, Verification>,
  present: ReadonlySet<string>,
): Promise<void> => {
  const previous = await readVerifications(root);
  const documents = Object.fromEntries(
    [...previous, ...results]
      .filter(([rel]) => present.has(rel))
      .toSorted(([a], [b]) => compareText(a, b)),
  );
  await Bun.write(verifyCachePath(root), `${JSON.stringify({ documents }, null, 2)}\n`);
};
