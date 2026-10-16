import { gitSync } from "../git/git.ts";
import { type Hunk, parseHunks, WHOLE_FILE } from "../git/hunks.ts";
import { isIsoDate } from "../text/dates.ts";
import { chunks, HEAD } from "./history.ts";
import type { CodeRoot } from "./links.ts";

export type Hunks = ReadonlyMap<string, readonly Hunk[]>;

export type LineCheck = { root: CodeRoot; since: string; paths: ReadonlySet<string> };

/** The commit the check saw: itself, or the last one on or before the checked day. */
const baseOf = (root: CodeRoot, since: string): string | undefined => {
  if (!isIsoDate(since)) return since;
  const base = gitSync(root.dir, [
    "rev-list",
    "-1",
    `--before=${since}T23:59:59`,
    root.ref ?? HEAD,
  ]);
  return base.ok ? base.out : undefined;
};

/**
 * Old-side hunks since the check, so they are in the line numbers the references were written
 * against. `ignoreSpace` leaves out changes of whitespace and blank lines only.
 */
export const hunksSince = (
  { root, since, paths }: LineCheck,
  { ignoreSpace = false }: { ignoreSpace?: boolean } = {},
): Hunks | undefined => {
  const base = baseOf(root, since);
  if (base === undefined) return undefined;
  if (!base) return new Map([...paths].map((path) => [path, [WHOLE_FILE]]));
  const hunks = new Map<string, readonly Hunk[]>();
  for (const batch of chunks([...paths])) {
    const diff = gitSync(root.dir, [
      "-c",
      "core.quotePath=false",
      "--literal-pathspecs",
      "diff",
      "-U0",
      ...(ignoreSpace ? ["--ignore-all-space", "--ignore-blank-lines"] : []),
      "--no-renames",
      "--no-ext-diff",
      "--no-color",
      "--relative",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      base,
      root.ref ?? HEAD,
      "--",
      ...batch,
    ]);
    if (!diff.ok) return undefined;
    for (const [path, fileHunks] of parseHunks(diff.out)) hunks.set(path, fileHunks);
  }
  return hunks;
};
