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

export const VERIFY_COMMAND_FIELD = "verify-cmd";

/**
 * Every document may carry `filter`, the base filter of its generated blocks; `blocked_by` and
 * `until`, the ids or documents it waits for or that end its deferral; and a command that re-checks it.
 */
const BUILT_IN_FIELDS: Readonly<Record<string, FieldSpec>> = {
  filter: { required: false, format: "text" },
  blocked_by: { required: false, format: "text" },
  until: { required: false, format: "text" },
  [VERIFY_COMMAND_FIELD]: { required: false, format: "text" },
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

/** The ledger of the type whose closed items this `resolved-of` type receives, status vocabulary swapped for the outcomes. */
export const closedLedgerOf = (
  config: Config,
  type: string | undefined,
): LedgerConfig | undefined => {
  const base = Object.values(config.types).find((kind) => kind.closeInto === type);
  const ledger = ledgerOf(config, base);
  if (!ledger) return undefined;
  const columns = ledger.columns.map((column) =>
    column.key === "status" ? { ...column, enum: ledger.closed } : column,
  );
  return { ...ledger, columns, open: [] };
};

/** Every ledger the store uses: the store's and the ones types bring. */
export const allLedgers = (config: Config): LedgerConfig[] => [
  ...(config.ledger ? [config.ledger] : []),
  ...Object.values(config.types).flatMap((type) => (type.ledger ? [type.ledger] : [])),
];

/** Statuses a document of the type keeps in the archive: the archive's own, and those `lifecycle` sends there. */
export const archivedStatuses = (config: Config, type: string | undefined): string[] => {
  const sent = (type === undefined ? [] : (config.lifecycle[type] ?? [])).flatMap((step) =>
    step.place === "archive" && typeof step.when === "object" ? [step.when.status] : [],
  );
  return [config.archive.status, ...config.archive.finished, ...sent];
};
