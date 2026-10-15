import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import { TroveError } from "../core/errors.ts";

export { parseFilters } from "../core/index/filters.ts";

export const STORE_OPTIONS = {
  store: { type: "string" },
  config: { type: "string" },
} as const satisfies ParseArgsOptionsConfig;

/** `--columns`, with `--fields` kept as its older name. */
export const COLUMN_OPTIONS = {
  columns: { type: "string" },
  fields: { type: "string" },
} as const satisfies ParseArgsOptionsConfig;

export const requestedColumns = (values: {
  columns?: string | undefined;
  fields?: string | undefined;
}): string[] | undefined =>
  (values.columns ?? values.fields)
    ?.split(",")
    .map((column) => column.trim())
    .filter(Boolean);

export const parse = <const Options extends ParseArgsOptionsConfig>(
  argv: readonly string[],
  options: Options,
) => {
  try {
    return parseArgs({ args: [...argv], options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new TroveError((error as Error).message);
  }
};

/** `owner=web what="a, b"` → `{ owner: "web", what: "a, b" }`. */
export const parsePairs = (pairs: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    pairs.map((pair) => {
      const at = pair.indexOf("=");
      if (at <= 0) throw new TroveError(`expected key=value: ${pair}`);
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
