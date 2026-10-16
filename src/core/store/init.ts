import { basename, relative, resolve } from "node:path";
import { TroveError } from "../errors.ts";
import { git, gitOrThrow, toplevel } from "../git/git.ts";
import { type Language, presetConfig } from "../presets/presets.ts";
import { writeReports } from "../reports/write.ts";
import { hasErrors } from "../rules/diagnostic.ts";
import { runRules } from "../rules/run.ts";
import { prepareRepository } from "./hook.ts";
import { openStore } from "./open.ts";
import { toPosix } from "./paths.ts";
import { type Pointer, readPointer, type StoreEntry, writePointer } from "./pointer.ts";
import { registerProject } from "./registry.ts";
import { withProjectRoot, writeScaffold } from "./scaffold.ts";

export type InitOptions = {
  cwd: string;
  /** Relative to the project root; `../<project>-trove` by default. */
  path?: string | undefined;
  name?: string | undefined;
  remote?: string | undefined;
  scope?: readonly string[] | undefined;
  language: Language;
  /** A plain folder without a git repository. */
  git?: boolean | undefined;
  /** Adds a store to a project that already has one, instead of refusing. */
  append?: boolean | undefined;
  /** Writes the committed `.trove.yaml` for teammates; otherwise nothing shows in the project tree. */
  share?: boolean | undefined;
};

export type InitResult = {
  project: string;
  store: string;
  entry: StoreEntry;
  /** The pointer written; none when the project is not a git repository and not shared. */
  pointer: string | undefined;
  committed: boolean;
  warnings: readonly string[];
};

const DEFAULT_NAME = "main";
const INITIAL_COMMIT = "trove: init store";

const commitAll = async (root: string, remote: string | undefined): Promise<string[]> => {
  await gitOrThrow(root, ["init", "--quiet", "--initial-branch=main"]);
  await prepareRepository(root);
  if (remote) await gitOrThrow(root, ["remote", "add", "origin", remote]);
  await gitOrThrow(root, ["add", "--all"]);
  const commit = await git(root, ["commit", "--quiet", "-m", INITIAL_COMMIT]);
  return commit.ok ? [] : [`store created but not committed: ${commit.err}`];
};

const withEntry = (pointer: Pointer | undefined, entry: StoreEntry): Pointer => {
  if (pointer?.stores.some((store) => store.name === entry.name)) {
    throw new TroveError(`this project already has a store named ${entry.name}`);
  }
  return { stores: [...(pointer?.stores ?? []), entry] };
};

/** Creates the store, links it from the project and registers both on this machine. */
export const initStore = async (options: InitOptions): Promise<InitResult> => {
  const project = (await toplevel(options.cwd)) ?? options.cwd;
  const pointer = await readPointer(project);
  if (pointer && !options.append) {
    throw new TroveError(
      `this project already has ${pointer.file}: run trove clone, or trove store add`,
    );
  }

  const name = options.name ?? DEFAULT_NAME;
  const projectName = basename(project);
  const root = resolve(project, options.path ?? `../${projectName}-trove`);
  const projectPath = toPosix(relative(root, project));
  const configText = withProjectRoot(
    presetConfig(options.language),
    projectName,
    projectPath,
  ).replace(/^sync: off$/m, `sync: ${options.remote ? "push" : "off"}`);
  await writeScaffold(root, { project: projectName, projectPath, configText });

  const store = await openStore({ cwd: root, store: root });
  await writeReports(store.index, Object.keys(store.config.reports));
  const reopened = await openStore({ cwd: root, store: root });
  if (hasErrors(runRules(reopened.rules, reopened.index))) {
    throw new TroveError(`the new store at ${root} does not pass trove check`);
  }

  const warnings = options.git === false ? [] : await commitAll(root, options.remote);
  const entry: StoreEntry = {
    name,
    path: toPosix(relative(project, root)),
    ...(options.remote ? { remote: options.remote } : {}),
    ...(options.scope?.length ? { scope: [...options.scope] } : {}),
  };
  const updated = withEntry(pointer, entry);
  const place = options.share ? "shared" : (pointer?.place ?? "private");
  const written = await writePointer(project, updated, place);
  await registerProject({
    root: project,
    stores: updated.stores.map((store) => ({
      name: store.name,
      path: resolve(project, store.path),
    })),
  });
  return {
    project,
    store: root,
    entry,
    pointer: written,
    committed: options.git !== false && warnings.length === 0,
    warnings: written
      ? warnings
      : [
          ...warnings,
          "the project is not a git repository: linked through this machine's registry only",
        ],
  };
};
