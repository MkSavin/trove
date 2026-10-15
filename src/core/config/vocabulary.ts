import type { Capability, Config, DocumentTypeConfig, FieldSpec, LedgerConfig } from "./schema.ts";

/** Resolves a display label (or the key itself) back to its key. */
export const keyOf = (
  vocabulary: Readonly<Record<string, string>>,
  value: string,
): string | undefined =>
  Object.hasOwn(vocabulary, value)
    ? value
    : Object.entries(vocabulary).find(([, label]) => label === value)?.[0];

export const labelOf = (vocabulary: Readonly<Record<string, string>>, key: string): string =>
  vocabulary[key] ?? key;

export const typeConfig = (
  config: Config,
  type: string | undefined,
): DocumentTypeConfig | undefined =>
  type !== undefined && Object.hasOwn(config.types, type) ? config.types[type] : undefined;

/** Every document may carry `filter`, the base filter of its generated blocks. */
const BUILT_IN_FIELDS: Readonly<Record<string, FieldSpec>> = {
  filter: { required: false, format: "text" },
};

/** Store-wide fields merged with the type's own; the type wins. */
export const fieldSpecs = (
  config: Config,
  type: DocumentTypeConfig | undefined,
): Readonly<Record<string, FieldSpec>> => ({
  ...BUILT_IN_FIELDS,
  ...config.fields,
  ...type?.fields,
});

export const hasCapability = (
  type: DocumentTypeConfig | undefined,
  capability: Capability,
): boolean => type?.capabilities.includes(capability) ?? false;

/** The type's own ledger, else the store's. */
export const ledgerOf = (
  config: Config,
  type: DocumentTypeConfig | undefined,
): LedgerConfig | undefined => type?.ledger ?? config.ledger;

/** Every ledger the store uses: the store's and the ones types bring. */
export const allLedgers = (config: Config): LedgerConfig[] => [
  ...(config.ledger ? [config.ledger] : []),
  ...Object.values(config.types).flatMap((type) => (type.ledger ? [type.ledger] : [])),
];
