import { z } from "zod";
import { configSchema } from "./schema.ts";

export const SCHEMA_URL =
  "https://raw.githubusercontent.com/MkSavin/trove/main/schema/config.schema.json";

/** First line of a config that points YAML editors at the schema. */
export const SCHEMA_MODELINE = `# yaml-language-server: $schema=${SCHEMA_URL}`;

/** Describes the file as written, before defaults and shorthand expansion. */
export const configJsonSchema = (): Record<string, unknown> => {
  const { $schema, ...rest } = z.toJSONSchema(configSchema, { io: "input" });
  return { $schema, $id: SCHEMA_URL, title: "trove store config", ...rest };
};

export const configJsonSchemaText = (): string =>
  `${JSON.stringify(configJsonSchema(), null, 2)}\n`;

export const withSchemaModeline = (configText: string): string =>
  configText.startsWith(SCHEMA_MODELINE) ? configText : `${SCHEMA_MODELINE}\n${configText}`;
