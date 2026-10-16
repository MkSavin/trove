import { join, resolve } from "node:path";
import { z } from "zod";
import { TroveError } from "../errors.ts";
import { git } from "../git/git.ts";

/** The pointer committed with the project, for a team that shares its stores. */
export const POINTER_FILE = ".trove.yaml";
/** The pointer of this clone only, inside its git directory: nothing shows in the project tree. */
export const PRIVATE_POINTER = "trove.yaml";

/** `shared` lives in the project tree, `private` in its `.git` folder. */
export type PointerPlace = "shared" | "private";

const entrySchema = z.strictObject({
  name: z.string().regex(/^[a-z\d][a-z\d-]*$/, "lowercase letters, digits and dashes"),
  /** Relative to the project root, e.g. `../app-trove`. */
  path: z.string(),
  remote: z.string().optional(),
  /** Project folders whose commands go to this store when the project has several. */
  scope: z.array(z.string()).optional(),
});

const pointerSchema = z.strictObject({ stores: z.array(entrySchema).min(1) });

export type StoreEntry = z.output<typeof entrySchema>;
export type Pointer = z.output<typeof pointerSchema>;
export type PlacedPointer = Pointer & { place: PointerPlace; file: string };

const HEADERS: Readonly<Record<PointerPlace, string>> = {
  shared: "# Stores of this project, for trove. Commit it so teammates can run `trove clone`.\n",
  private:
    "# Stores of this clone, for trove. Lives in the git folder, so the project never shows it.\n",
};

/** The git folder shared by every worktree of the project; none outside a repository. */
const gitFolder = async (projectRoot: string): Promise<string | undefined> => {
  const result = await git(projectRoot, ["rev-parse", "--git-common-dir"]);
  return result.ok ? resolve(projectRoot, result.out) : undefined;
};

export const pointerFile = async (
  projectRoot: string,
  place: PointerPlace,
): Promise<string | undefined> => {
  if (place === "shared") return join(projectRoot, POINTER_FILE);
  const folder = await gitFolder(projectRoot);
  return folder ? join(folder, PRIVATE_POINTER) : undefined;
};

const readAt = async (file: string): Promise<Pointer | undefined> => {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return undefined;
  const parsed = pointerSchema.safeParse(Bun.YAML.parse(await handle.text()));
  if (!parsed.success) throw new TroveError(`${file} is invalid: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
};

/** The committed pointer, else the private one of this clone. */
export const readPointer = async (projectRoot: string): Promise<PlacedPointer | undefined> => {
  for (const place of ["shared", "private"] as const) {
    const file = await pointerFile(projectRoot, place);
    const pointer = file ? await readAt(file) : undefined;
    if (file && pointer) return { ...pointer, place, file };
  }
  return undefined;
};

export const writePointer = async (
  projectRoot: string,
  pointer: Pointer,
  place: PointerPlace,
): Promise<string | undefined> => {
  const file = await pointerFile(projectRoot, place);
  if (!file) return undefined;
  const { stores } = pointer;
  await Bun.write(file, `${HEADERS[place]}${Bun.YAML.stringify({ stores }, null, 2)}\n`);
  return file;
};

export const entryRoot = (projectRoot: string, entry: StoreEntry): string =>
  resolve(projectRoot, entry.path);
