import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { TroveError } from "../errors.ts";
import { samePath } from "../text/real-path.ts";

const registrySchema = z.strictObject({
  projects: z
    .array(
      z.strictObject({
        root: z.string(),
        stores: z.array(z.strictObject({ name: z.string(), path: z.string() })),
      }),
    )
    .default([]),
});

export type Registry = z.output<typeof registrySchema>;
export type RegisteredProject = Registry["projects"][number];

/** `$TROVE_HOME`, or `~/.trove`. */
export const troveHome = (): string => process.env.TROVE_HOME ?? join(homedir(), ".trove");

const registryFile = () => Bun.file(join(troveHome(), "registry.yaml"));

/** Windows paths differ only by case for the same folder. */

export const readRegistry = async (): Promise<Registry> => {
  const file = registryFile();
  if (!(await file.exists())) return { projects: [] };
  const parsed = registrySchema.safeParse(Bun.YAML.parse(await file.text()) ?? {});
  if (!parsed.success)
    throw new TroveError(`${file.name} is invalid: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
};

const writeRegistry = (registry: Registry): Promise<number> =>
  Bun.write(registryFile(), `${Bun.YAML.stringify(registry, null, 2)}\n`);

/** Adds or replaces the project's stores. */
export const registerProject = async (project: RegisteredProject): Promise<void> => {
  const registry = await readRegistry();
  const others = registry.projects.filter((entry) => !samePath(entry.root, project.root));
  await writeRegistry({ projects: [...others, project] });
};

export const forgetProject = async (root: string): Promise<boolean> => {
  const registry = await readRegistry();
  const kept = registry.projects.filter((entry) => !samePath(entry.root, root));
  if (kept.length === registry.projects.length) return false;
  await writeRegistry({ projects: kept });
  return true;
};

export const findProject = async (root: string): Promise<RegisteredProject | undefined> =>
  (await readRegistry()).projects.find((entry) => samePath(entry.root, root));
