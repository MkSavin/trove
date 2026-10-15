import { relative, sep } from "node:path";
import type { Config } from "../config/schema.ts";

export type Place = "work" | "archive";

export const toPosix = (path: string): string => path.split(sep).join("/");

export const relativePath = (root: string, path: string): string => toPosix(relative(root, path));

export const placeOf = (
  rel: string,
  config: Config,
): { place: Place; folder: string | undefined } => {
  const archivePrefix = `${config.archive.folder}/`;
  const place: Place = rel.startsWith(archivePrefix) ? "archive" : "work";
  const segments = (place === "archive" ? rel.slice(archivePrefix.length) : rel).split("/");
  return { place, folder: segments.length > 1 ? segments[0] : undefined };
};
