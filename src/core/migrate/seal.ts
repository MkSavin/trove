import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { TroveError } from "../errors.ts";
import { git, gitOrThrow } from "../git/git.ts";
import { toPosix } from "../store/paths.ts";
import { today } from "../text/dates.ts";
import { sourceChangedSince } from "./drift.ts";
import { readOrigin, recordOrigin } from "./origin.ts";
import { snapshotSource } from "./snapshot.ts";

const MOVED_FILE = "MOVED.md";
const AGENTS_FILE = "AGENTS.md";
const NOTICE = "> **Moved.**";

export type Sealed = { source: string; files: readonly string[]; commit: string | undefined };

const movedText = (where: string, date: string): string =>
  `# Moved\n\nThis archive moved to \`${where}\` on ${date}. It is kept only for its history.\n\n` +
  "Do not add or edit anything here: make every change in the store.\n";

const notice = (where: string): string =>
  `${NOTICE} This archive moved to \`${where}\` and must not be written to: see ${MOVED_FILE}.`;

/** Puts the notice on the first line, replacing an earlier one. */
const withNotice = (text: string, line: string): string => {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (text === "") return `${line}${eol}`;
  if (!text.startsWith(NOTICE)) return `${line}${eol}${eol}${text}`;
  const end = text.indexOf(eol);
  return end < 0 ? `${line}${eol}` : `${line}${text.slice(end)}`;
};

const commitSeal = async (source: string, store: string): Promise<string | undefined> => {
  const files = [MOVED_FILE, AGENTS_FILE];
  await gitOrThrow(source, ["add", "--", ...files]);
  if ((await git(source, ["diff", "--cached", "--quiet", "--", ...files])).ok) return undefined;
  const message = `docs: moved to ${basename(store)}`;
  const done = await git(source, ["commit", "--quiet", "-m", message, "--", ...files]);
  if (!done.ok) throw new TroveError(`sealed, but the commit in ${source} failed: ${done.err}`);
  return gitOrThrow(source, ["rev-parse", "--short", "HEAD"]);
};

/**
 * Marks the migrated-from archive as moved: a MOVED.md and a first line in its AGENTS.md, committed
 * there when it is a repository. Refuses while the archive holds work the store has not taken in.
 */
export const sealSource = async (store: string): Promise<Sealed> => {
  const origin = await readOrigin(store);
  if (!existsSync(origin.source)) throw new TroveError(`no archive at ${origin.source}`);
  if (await sourceChangedSince(store, origin.source, origin.state)) {
    throw new TroveError("the archive changed after the last resync: run trove resync first");
  }
  const where = toPosix(relative(origin.source, store));
  await Bun.write(join(origin.source, MOVED_FILE), movedText(where, today()));
  const agents = Bun.file(join(origin.source, AGENTS_FILE));
  const text = (await agents.exists()) ? await agents.text() : "";
  await Bun.write(agents, withNotice(text, notice(where)));

  const commit = existsSync(join(origin.source, ".git"))
    ? await commitSeal(origin.source, store)
    : undefined;
  // The seal is the store's own change to the archive, so a later resync must not bring it back.
  await recordOrigin(store, origin.source, origin.drop, await snapshotSource(origin.source, store));
  return { source: origin.source, files: [MOVED_FILE, AGENTS_FILE], commit };
};
