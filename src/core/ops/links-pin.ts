import { relative, resolve, sep } from "node:path";
import type { Document } from "../document/document.ts";
import { applyPatches, insert, type Patch, replace } from "../edit/patch.ts";
import { type Deletion, findDeletion } from "../git/deletion.ts";
import { permalink } from "../git/permalink.ts";
import type { StoreIndex } from "../index/index.ts";
import { type CodeRoot, codeRoot, type ResolvedLink, resolveLink } from "../index/links.ts";
import { deletedNote, type Link } from "../markdown/links.ts";
import type { Plan } from "./plan.ts";

type DeadLink = { doc: Document; link: Link; resolved: ResolvedLink };
type Lookup = { key: string; root: CodeRoot; path: string };

const deadCodeLinks = (index: StoreIndex, docs: readonly Document[]): DeadLink[] =>
  docs.flatMap((doc) =>
    doc.links.flatMap((link) => {
      const resolved = resolveLink(index, doc, link);
      return resolved.kind === "code" && resolved.state === "dead" ? [{ doc, link, resolved }] : [];
    }),
  );

const lookupOf = (index: StoreIndex, target: string): Lookup | undefined => {
  const absolute = resolve(index.root, target);
  const root = codeRoot(index, absolute);
  if (!root) return undefined;
  const path = relative(root.dir, absolute).split(sep).join("/");
  return { key: `${root.dir}\0${path}`, root, path };
};

/** One git lookup per file, one at a time, however many links point at it. */
const findDeletions = async (
  lookups: readonly Lookup[],
): Promise<Map<string, Deletion | string>> => {
  const found = new Map<string, Deletion | string>();
  for (const { key, root, path } of lookups) {
    if (!found.has(key)) found.set(key, await findDeletion(root.dir, root.ref ?? "HEAD", path));
  }
  return found;
};

const pinPatch = (link: Link, deletion: Deletion): Patch =>
  deletion.web
    ? replace(link, permalink(deletion.web, deletion.parent, deletion.path))
    : insert(link.after, deletedNote(deletion.short));

const where = ({ file, line, target }: ResolvedLink): string => `${file}:${line} ${target}`;

/**
 * Dead links into code that git deleted point at the last version: a web permalink when `origin`
 * serves one, otherwise a `*(deleted in <sha>)*` note the dead-link rule checks at that commit.
 */
export const pinDeadLinks = async (index: StoreIndex, docs: readonly Document[]): Promise<Plan> => {
  const dead = deadCodeLinks(index, docs).map((entry) => ({
    ...entry,
    lookup: entry.link.deletedIn ? undefined : lookupOf(index, entry.resolved.target),
  }));
  const deletions = await findDeletions(dead.flatMap(({ lookup }) => (lookup ? [lookup] : [])));
  const found = dead.map((entry) => ({
    ...entry,
    deletion: entry.lookup
      ? (deletions.get(entry.lookup.key) ?? "never in git history")
      : `not in the parent of ${entry.link.deletedIn}`,
  }));

  const pinned = found.flatMap(({ doc, link, resolved, deletion }) =>
    typeof deletion === "string"
      ? []
      : [{ doc, resolved, deletion, patch: pinPatch(link, deletion) }],
  );
  const changes = [...Map.groupBy(pinned, ({ doc }) => doc)].map(([doc, entries]) => ({
    rel: doc.rel,
    text: applyPatches(
      doc.text,
      entries.map(({ patch }) => patch),
    ),
  }));
  const notes = [
    ...pinned.map(({ resolved, deletion }) => `${where(resolved)}: deleted in ${deletion.short}`),
    ...found.flatMap(({ resolved, deletion }) =>
      typeof deletion === "string" ? [`${where(resolved)}: left as is, ${deletion}`] : [],
    ),
  ];
  return { changes, notes, message: "docs: pin links to deleted code" };
};
