import type { Config } from "../config/schema.ts";
import { toPosix } from "./paths.ts";

const MARKDOWN = new Bun.Glob("**/*.md");
const SKIPPED_DIRECTORIES = new Set(["node_modules"]);

const isVisibleDirectory = (segment: string, depth: number, config: Config): boolean =>
  !SKIPPED_DIRECTORIES.has(segment) &&
  (!segment.startsWith(".") || (depth === 0 && segment === config.archive.folder));

/** A bare name matches that file anywhere; a pattern with `/` or `*` matches store paths. */
const ignoredBy = (patterns: readonly string[]) => {
  const names = new Set(patterns.filter((p) => !/[/*]/.test(p)));
  const globs = patterns.filter((p) => /[/*]/.test(p)).map((p) => new Bun.Glob(p));
  return (rel: string, name: string): boolean =>
    names.has(name) || globs.some((glob) => glob.match(rel));
};

/** Whether a store-relative `.md` path is a document: hidden folders other than the archive are not. */
export const documentPath = (config: Config): ((rel: string) => boolean) => {
  const ignored = ignoredBy(config.ignore);
  const outputs = new Set(Object.values(config.reports).map((report) => report.output));
  return (rel) => {
    const segments = rel.split("/");
    const name = segments.pop() ?? "";
    return (
      name.endsWith(".md") &&
      segments.every((segment, depth) => isVisibleDirectory(segment, depth, config)) &&
      !ignored(rel, name) &&
      !outputs.has(rel)
    );
  };
};

export const listDocuments = async (root: string, config: Config): Promise<string[]> => {
  const found = await Array.fromAsync(MARKDOWN.scan({ cwd: root, dot: true }));
  return found.map(toPosix).filter(documentPath(config)).sort();
};
