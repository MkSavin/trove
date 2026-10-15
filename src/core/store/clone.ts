import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CONFIG_FILE } from "../config/load.ts";
import { TroveError } from "../errors.ts";
import { gitOrThrow, toplevel } from "../git/git.ts";
import { prepareRepository } from "./hook.ts";
import { entryRoot, readPointer } from "./pointer.ts";
import { registerProject } from "./registry.ts";

export type CloneResult = { name: string; root: string; action: "cloned" | "found" };

const cloneOne = async (
  name: string,
  root: string,
  remote: string | undefined,
): Promise<CloneResult> => {
  if (existsSync(join(root, CONFIG_FILE))) return { name, root, action: "found" };
  if (!remote) throw new TroveError(`store ${name} is not at ${root} and has no remote to clone`);
  try {
    await gitOrThrow(dirname(root), ["clone", "--quiet", remote, root]);
  } catch (error) {
    throw new TroveError(
      `cannot clone ${remote}; ask the owners for access. ${(error as Error).message}`,
    );
  }
  await prepareRepository(root);
  return { name, root, action: "cloned" };
};

/** Brings every store named in the project's `.trove.yaml` onto this machine. */
export const cloneStores = async (cwd: string): Promise<CloneResult[]> => {
  const project = (await toplevel(cwd)) ?? cwd;
  const pointer = await readPointer(project);
  if (!pointer) throw new TroveError("no .trove.yaml in this project: run trove init");

  const results: CloneResult[] = [];
  for (const entry of pointer.stores) {
    results.push(await cloneOne(entry.name, entryRoot(project, entry), entry.remote));
  }
  await registerProject({
    root: project,
    stores: pointer.stores.map((entry) => ({
      name: entry.name,
      path: resolve(project, entry.path),
    })),
  });
  return results;
};
