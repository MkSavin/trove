import type { Config, LedgerConfig } from "./schema.ts";

const LEDGER_KEYS = ["id", "status"] as const;

const missing = (wanted: Iterable<string>, known: object, where: string): string[] =>
  [...wanted].filter((key) => !Object.hasOwn(known, key)).map((key) => `${where}: unknown ${key}`);

const checkVocabulary = (config: Config): string[] => [
  ...missing([config.archive.status], config.statuses, "archive.status"),
  ...Object.entries(config.folders).flatMap(([name, folder]) =>
    missing(folder.types, config.types, `folders.${name}.types`),
  ),
  ...Object.entries(config.types).flatMap(([name, type]) => [
    ...missing(type.statuses ?? [], config.statuses, `types.${name}.statuses`),
    ...missing(
      type.initial === undefined ? [] : [type.initial],
      config.statuses,
      `types.${name}.initial`,
    ),
  ]),
  ...Object.entries(config.lifecycle).flatMap(([type, steps]) => [
    ...missing([type], config.types, "lifecycle"),
    ...steps.flatMap((step) =>
      typeof step.when === "object"
        ? missing([step.when.status], config.statuses, `lifecycle.${type}`)
        : [],
    ),
  ]),
];

const checkLedgerShape = (ledger: LedgerConfig, where: string): string[] => {
  const keys = new Set(ledger.columns.map((column) => column.key));
  const statusEnum = ledger.columns.find((column) => column.key === "status")?.enum;
  return [
    ...LEDGER_KEYS.filter((key) => !keys.has(key)).map(
      (key) => `${where}.columns: no ${key} column`,
    ),
    ...(statusEnum ? missing(ledger.open, statusEnum, `${where}.open`) : []),
    ...(ledger.id.includes("{section}") && !ledger.sections
      ? [`${where}.id: {section} needs ${where}.sections`]
      : []),
  ];
};

const checkLedger = (config: Config): string[] =>
  Object.entries(config.types)
    .flatMap(([name, type]) => {
      if (!type.capabilities.includes("ledger")) return [];
      if (type.ledger) return checkLedgerShape(type.ledger, `types.${name}.ledger`);
      if (config.ledger) return [];
      return [`types.${name}: capability ledger needs a ledger section`];
    })
    .concat(config.ledger ? checkLedgerShape(config.ledger, "ledger") : []);

const checkReports = (config: Config): string[] =>
  Object.entries(config.reports).flatMap(([name, report]) => [
    ...missing([report.type], config.types, `reports.${name}.type`),
    ...missing([report.status], config.statuses, `reports.${name}.status`),
    ...(config.types[report.type]?.capabilities.includes("generated") === false
      ? [`reports.${name}.type: ${report.type} lacks capability generated`]
      : []),
    ...report.sections.flatMap((section, i) =>
      section.columns.length === 0 && !section.count
        ? [`reports.${name}.sections.${i}: needs columns or count`]
        : [],
    ),
  ]);

const checkSummaries = (config: Config): string[] =>
  Object.entries(config.summaries).flatMap(([name, summary]) =>
    missing([summary.type], config.types, `summaries.${name}.type`),
  );

/** Cross-references the schema cannot express. */
export const validateConfig = (config: Config): string[] => [
  ...checkVocabulary(config),
  ...checkLedger(config),
  ...checkReports(config),
  ...checkSummaries(config),
];
