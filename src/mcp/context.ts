import { z } from "zod";
import { openStore, type Store } from "../core/store/open.ts";

export type Context = { cwd: string };

export const storeField = z
  .string()
  .optional()
  .describe(
    "Store name from the project's .trove.yaml, or a folder; omit when the project has one",
  );

export const filtersField = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export const asFilters = (
  filters: Readonly<Record<string, string | string[]>> | undefined,
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(filters ?? {}).map(([key, value]) => [
      key,
      Array.isArray(value) ? value : [value],
    ]),
  );

export const dryRunField = z.boolean().optional().describe("Return the diff without writing");

export const openFor = (context: Context, store: string | undefined): Promise<Store> =>
  openStore({ cwd: context.cwd, store });
