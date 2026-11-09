import { join } from "node:path";
import type { Config } from "../config/schema.ts";
import { ensureLines, missingLines } from "./ensure-lines.ts";

export const SEARCH_IGNORE_FILE = ".ignore";

const archiveLine = (config: Config): string => `${config.archive.folder.replace(/\/+$/, "")}/`;

/** Keeps the archive out of ripgrep-style searches; true when the file changed. */
export const ignoreArchive = (root: string, config: Config): Promise<boolean> =>
  ensureLines(join(root, SEARCH_IGNORE_FILE), [archiveLine(config)]);

export const archiveIgnored = async (root: string, config: Config): Promise<boolean> =>
  (await missingLines(join(root, SEARCH_IGNORE_FILE), [archiveLine(config)])).length === 0;
