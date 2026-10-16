import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { CONFIG_FILE } from "../config/load.ts";
import { samePath } from "../text/real-path.ts";

type Root = string | { path?: unknown };

const rootPaths = (config: unknown): string[] => {
  const roots = (config as { roots?: Record<string, Root> } | undefined)?.roots ?? {};
  return Object.values(roots).flatMap((root) => {
    const path = typeof root === "string" ? root : root?.path;
    return typeof path === "string" ? [path] : [];
  });
};

/** Stores next to the project whose `roots` name it: found with no pointer and no registry. */
export const siblingStores = async (
  projectRoot: string,
): Promise<{ name: string; root: string }[]> => {
  const parent = dirname(projectRoot);
  const folders = await readdir(parent, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    folders
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const root = join(parent, entry.name);
        const file = Bun.file(join(root, CONFIG_FILE));
        if (!(await file.exists())) return undefined;
        const config: unknown = await file
          .text()
          .then((text) => Bun.YAML.parse(text))
          .catch(() => undefined);
        const names = rootPaths(config).some((path) => samePath(resolve(root, path), projectRoot));
        return names ? { name: basename(root), root } : undefined;
      }),
  );
  return found.filter((entry) => entry !== undefined);
};
