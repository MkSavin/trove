import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Document } from "../document/document.ts";
import { resolveFrom } from "../edit/links.ts";
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

type CodeRoot = { dir: string; ref: string | undefined };

const codeRoot = (index: StoreIndex, absolute: string): CodeRoot | undefined =>
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
    const listed = Bun.spawnSync(args, { env: process.env });
    cache.set(
      key,
      listed.exitCode === 0
        ? new Set(listed.stdout.toString().split("\0").filter(Boolean))
        : undefined,
    );
  }
  return cache.get(key);
};

const codeState = (index: StoreIndex, root: CodeRoot, absolute: string): LinkState => {
  if (!existsSync(root.dir)) return "unchecked";
  if (!root.ref) return existsSync(absolute) ? "ok" : "dead";
  const tree = treeAt(index, root.dir, root.ref);
  if (!tree) return "unchecked";
  const path = relative(root.dir, absolute).split(sep).join("/");
  return path === "" || tree.has(path) ? "ok" : "dead";
};

const classify = (index: StoreIndex, target: string): Pick<ResolvedLink, "kind" | "state"> => {
  const absolute = resolve(index.root, target);
  if (!target.startsWith("../")) {
    const state = existsSync(absolute) ? "ok" : "dead";
    return { kind: index.byRel.has(target) ? "document" : "store", state };
  }
  const root = codeRoot(index, absolute);
  if (!root) return { kind: "outside", state: "unchecked" };
  return { kind: "code", state: codeState(index, root, absolute) };
};

export const resolveLinks = (index: StoreIndex, doc: Document): ResolvedLink[] =>
  doc.links.map((link) => {
    const target = resolveFrom(doc.rel, decode(link.path));
    return { file: doc.rel, line: link.line, target, ...classify(index, target) };
  });
