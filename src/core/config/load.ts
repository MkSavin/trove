import { TroveError } from "../errors.ts";
import { type Config, configSchema } from "./schema.ts";
import { validateConfig } from "./validate.ts";

export const CONFIG_FILE = "trove.yaml";

const readYaml = (source: string, origin: string): unknown => {
  try {
    return Bun.YAML.parse(source);
  } catch (error) {
    const { message, line } = error as Error & { line?: number };
    throw new TroveError(`${origin}${line === undefined ? "" : `:${line}`}: ${message}`);
  }
};

const invalid = (origin: string, problems: readonly string[]): TroveError =>
  new TroveError(`${origin} is invalid:\n${problems.map((p) => `  ${p}`).join("\n")}`);

const ensureValid = (config: Config, origin: string): Config => {
  const problems = validateConfig(config);
  if (problems.length > 0) throw invalid(origin, problems);
  return config;
};

export const parseConfig = (source: string, origin: string): Config => {
  const parsed = configSchema.safeParse(readYaml(source, origin));
  if (!parsed.success) {
    throw invalid(
      origin,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return ensureValid(parsed.data, origin);
};

export const loadConfig = async (path: string): Promise<Config> => {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new TroveError(`no config at ${path}`);
  return parseConfig(await file.text(), path);
};
