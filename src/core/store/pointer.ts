import { join, resolve } from "node:path";
import { z } from "zod";
import { TroveError } from "../errors.ts";

export const POINTER_FILE = ".trove.yaml";

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

const HEADER =
  "# Stores of this project, for trove. Commit it so teammates can run `trove clone`.\n";

export const readPointer = async (projectRoot: string): Promise<Pointer | undefined> => {
  const file = Bun.file(join(projectRoot, POINTER_FILE));
  if (!(await file.exists())) return undefined;
  const parsed = pointerSchema.safeParse(Bun.YAML.parse(await file.text()));
  if (!parsed.success) {
    throw new TroveError(`${POINTER_FILE} is invalid: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
};

export const writePointer = (projectRoot: string, pointer: Pointer): Promise<number> =>
  Bun.write(join(projectRoot, POINTER_FILE), `${HEADER}${Bun.YAML.stringify(pointer, null, 2)}\n`);

export const entryRoot = (projectRoot: string, entry: StoreEntry): string =>
  resolve(projectRoot, entry.path);
