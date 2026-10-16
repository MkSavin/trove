import { relative, resolve, sep } from "node:path";
import type { Document } from "../document/document.ts";
import { applyPatches, insert, type Patch, replace } from "../edit/patch.ts";
import { type Found, findPin } from "../git/deletion.ts";
import { permalink } from "../git/permalink.ts";
import type { StoreIndex } from "../index/index.ts";
import { type CodeRoot, codeRoot, type ResolvedLink, resolveLink } from "../index/links.ts";
import { type Link, pinNote } from "../markdown/links.ts";
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
const findPins = async (lookups: readonly Lookup[]): Promise<Map<string, Found | string>> => {
  const found = new Map<string, Found | string>();
  for (const { key, root, path } of lookups) {
    if (!found.has(key)) found.set(key, await findPin(root.dir, root.ref ?? "HEAD", path));
  }
  return found;
};

const pinPatch = (link: Link, found: Found): Patch =>
  found.web
    ? replace(link, permalink(found.web, found.readAt, found.path))
    : insert(link.after, pinNote(found.pin));

const pinned = ({ pin, branch }: Found): string =>
  `${pin.note} ${pin.commit}${branch ? ` on ${branch}` : ""}`;

const where = ({ file, line, target }: ResolvedLink): string => `${file}:${line} ${target}`;

/**
 * Dead links into code point at the last version of the file: the parent of the commit that
 * deleted it, or the last commit of another branch that has it. A web permalink when `origin`
 * serves one, otherwise a `*(deleted in <sha>)*` or `*(at <sha>)*` note the dead-link rule checks.
 */
export const pinDeadLinks = async (index: StoreIndex, docs: readonly Document[]): Promise<Plan> => {
  const dead = deadCodeLinks(index, docs).map((entry) => ({
    ...entry,
    lookup: entry.link.pin ? undefined : lookupOf(index, entry.resolved.target),
  }));
  const pins = await findPins(dead.flatMap(({ lookup }) => (lookup ? [lookup] : [])));
  const found = dead.map((entry) => ({
    ...entry,
    deletion: entry.lookup
      ? (pins.get(entry.lookup.key) ?? "never in git history")
      : `not readable ${entry.link.pin?.note} ${entry.link.pin?.commit}`,
  }));

  const pinnedLinks = found.flatMap(({ doc, link, resolved, deletion }) =>
    typeof deletion === "string"
      ? []
      : [{ doc, resolved, deletion, patch: pinPatch(link, deletion) }],
  );
  const changes = [...Map.groupBy(pinnedLinks, ({ doc }) => doc)].map(([doc, entries]) => ({
    rel: doc.rel,
    text: applyPatches(
      doc.text,
      entries.map(({ patch }) => patch),
    ),
  }));
  const notes = [
    ...pinnedLinks.map(({ resolved, deletion }) => `${where(resolved)}: ${pinned(deletion)}`),
    ...found.flatMap(({ resolved, deletion }) =>
      typeof deletion === "string" ? [`${where(resolved)}: left as is, ${deletion}`] : [],
    ),
  ];
  return { changes, notes, message: "docs: pin links to deleted code" };
};
