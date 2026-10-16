import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { CONFIG_FILE } from "../config/load.ts";
import { TroveError } from "../errors.ts";
import { gitOrThrow, toplevel } from "../git/git.ts";
import { prepareRepository } from "./hook.ts";
import { toPosix } from "./paths.ts";
import { entryRoot, readPointer, writePointer } from "./pointer.ts";
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

/** Brings every store named in the project's pointer onto this machine. */
export const cloneStores = async (cwd: string): Promise<CloneResult[]> => {
  const project = (await toplevel(cwd)) ?? cwd;
  const pointer = await readPointer(project);
  if (!pointer) {
    throw new TroveError(
      "this project names no stores: run trove clone <store-url>, or trove init",
    );
  }

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

export type CloneUrlOptions = {
  cwd: string;
  remote: string;
  /** Relative to the project root; next to it, named after the repository, by default. */
  path?: string | undefined;
  name?: string | undefined;
  /** Writes the committed `.trove.yaml`; otherwise the link stays in `.git/trove.yaml`. */
  share?: boolean | undefined;
};

const REPOSITORY_NAME = /([^/:\\]+?)(?:\.git)?\/?$/;

/** Clones one store by its address and links it to the project without touching the project tree. */
export const cloneStore = async (options: CloneUrlOptions): Promise<CloneResult> => {
  const project = (await toplevel(options.cwd)) ?? options.cwd;
  const folder = REPOSITORY_NAME.exec(options.remote)?.[1];
  if (!folder && !options.path)
    throw new TroveError(`cannot name a folder for ${options.remote}: pass --path`);
  const root = resolve(project, options.path ?? `../${folder}`);
  const name = options.name ?? "main";
  const result = await cloneOne(name, root, options.remote);

  const pointer = await readPointer(project);
  const others = (pointer?.stores ?? []).filter((entry) => entry.name !== name);
  const stores = [
    ...others,
    { name, path: toPosix(relative(project, root)), remote: options.remote },
  ];
  await writePointer(project, { stores }, options.share ? "shared" : (pointer?.place ?? "private"));
  await registerProject({
    root: project,
    stores: stores.map((entry) => ({ name: entry.name, path: resolve(project, entry.path) })),
  });
  return result;
};
