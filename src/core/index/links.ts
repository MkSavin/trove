import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Document } from "../document/document.ts";
import { resolveFrom } from "../edit/links.ts";
import { gitEnv } from "../git/git.ts";
import type { Link } from "../markdown/links.ts";
import type { StoreIndex } from "./index.ts";

export type LinkKind = "document" | "store" | "code" | "outside";
/** `unchecked`: outside the store and outside every code root present on this machine. */
export type LinkState = "ok" | "dead" | "unchecked";

export type ResolvedLink = {
  file: string;
  line: number;
  target: string;
  kind: LinkKind;
  state: LinkState;
  /** Commit that deleted the target; the link is checked at its parent. */
  deletedIn?: string;
};

const decode = (path: string): string => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const contains = (folder: string, path: string): boolean => {
  const rel = relative(folder, path);
  return !rel.startsWith("..") && !isAbsolute(rel);
};

export type CodeRoot = { dir: string; ref: string | undefined };

export const codeRoot = (index: StoreIndex, absolute: string): CodeRoot | undefined =>
  Object.values(index.config.roots)
    .map(({ path, ref }) => ({ dir: resolve(index.root, path), ref }))
    .find(({ dir }) => contains(dir, absolute));

const trees = new WeakMap<StoreIndex, Map<string, ReadonlySet<string> | undefined>>();

/** Files and folders at the ref, read once per index; missing when the ref is unknown here. */
const treeAt = (index: StoreIndex, dir: string, ref: string): ReadonlySet<string> | undefined => {
  const cache = trees.get(index) ?? new Map<string, ReadonlySet<string> | undefined>();
  trees.set(index, cache);
  const key = `${dir}\0${ref}`;
  if (!cache.has(key)) {
    const args = ["git", "-C", dir, "ls-tree", "-r", "-t", "-z", "--name-only", ref];
    const listed = Bun.spawnSync(args, { env: gitEnv() });
    cache.set(
      key,
      listed.exitCode === 0
        ? new Set(listed.stdout.toString().split("\0").filter(Boolean))
        : undefined,
    );
  }
  return cache.get(key);
};

/** Files git ignores, such as installed packages, are never in a commit: they are read from the checkout. */
const ignoredInCheckout = (dir: string, absolute: string): boolean =>
  existsSync(absolute) &&
  Bun.spawnSync(["git", "-C", dir, "check-ignore", "-q", absolute], { env: gitEnv() }).exitCode ===
    0;

const stateAt = (index: StoreIndex, root: CodeRoot, absolute: string, ref: string): LinkState => {
  const tree = treeAt(index, root.dir, ref);
  if (!tree) return "unchecked";
  const path = relative(root.dir, absolute).split(sep).join("/");
  return path === "" || tree.has(path) || ignoredInCheckout(root.dir, absolute) ? "ok" : "dead";
};

const codeState = (
  index: StoreIndex,
  root: CodeRoot,
  absolute: string,
  deletedIn: string | undefined,
): LinkState => {
  if (!existsSync(root.dir)) return "unchecked";
  if (deletedIn) return stateAt(index, root, absolute, `${deletedIn}^`);
  if (!root.ref) return existsSync(absolute) ? "ok" : "dead";
  return stateAt(index, root, absolute, root.ref);
};

const classify = (
  index: StoreIndex,
  target: string,
  deletedIn: string | undefined,
): Pick<ResolvedLink, "kind" | "state"> => {
  const absolute = resolve(index.root, target);
  if (!target.startsWith("../")) {
    const state = existsSync(absolute) ? "ok" : "dead";
    return { kind: index.byRel.has(target) ? "document" : "store", state };
  }
  const root = codeRoot(index, absolute);
  if (!root) return { kind: "outside", state: "unchecked" };
  return { kind: "code", state: codeState(index, root, absolute, deletedIn) };
};

export const resolveLink = (index: StoreIndex, doc: Document, link: Link): ResolvedLink => {
  const target = resolveFrom(doc.rel, decode(link.path));
  const { deletedIn } = link;
  return {
    file: doc.rel,
    line: link.line,
    target,
    ...classify(index, target, deletedIn),
    ...(deletedIn ? { deletedIn } : {}),
  };
};

export const resolveLinks = (index: StoreIndex, doc: Document): ResolvedLink[] =>
  doc.links.map((link) => resolveLink(index, doc, link));
