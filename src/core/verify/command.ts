import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "../config/schema.ts";
import { VERIFY_COMMAND_FIELD } from "../config/vocabulary.ts";
import type { Document } from "../document/document.ts";
import { toPosix } from "../store/paths.ts";

export type Expanded =
  | { kind: "ready"; command: string }
  | { kind: "unknown-root"; root: string }
  | { kind: "missing-root"; root: string };

export const verifyCommandOf = (doc: Document): string | undefined =>
  doc.meta[VERIFY_COMMAND_FIELD]?.trim() || undefined;

const PLACEHOLDER = /\{(store|root:([^}]+))\}/g;

/** Forward slashes: Bun's shell reads a backslash as an escape, and Windows accepts both. */
const shellPath = (path: string): string => toPosix(path);

/** Fills `{store}` and `{root:<name>}` with absolute paths; the first root that is unknown or absent wins. */
export const expandCommand = (command: string, storeRoot: string, config: Config): Expanded => {
  let problem: Expanded | undefined;
  const expanded = command.replace(PLACEHOLDER, (whole, _: string, name: string | undefined) => {
    if (name === undefined) return shellPath(storeRoot);
    const root = Object.hasOwn(config.roots, name) ? config.roots[name] : undefined;
    if (!root) {
      problem ??= { kind: "unknown-root", root: name };
      return whole;
    }
    const dir = resolve(storeRoot, root.path);
    if (!existsSync(dir)) problem ??= { kind: "missing-root", root: name };
    return shellPath(dir);
  });
  return problem ?? { kind: "ready", command: expanded };
};
