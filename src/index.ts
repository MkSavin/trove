export { copyToClipboard } from "./core/adapters/clipboard.ts";
export { CONFIG_FILE, loadConfig, parseConfig } from "./core/config/load.ts";
export type {
  Capability,
  Config,
  DocumentTypeConfig,
  LedgerColumn,
  LedgerConfig,
  ReportConfig,
  Severity,
} from "./core/config/schema.ts";
export { CAPABILITIES, configSchema } from "./core/config/schema.ts";
export type { Document } from "./core/document/document.ts";
export { parseDocument } from "./core/document/document.ts";
export { staleDays } from "./core/document/freshness.ts";
export type { Item, Ledger } from "./core/document/ledger.ts";
export { TroveError } from "./core/errors.ts";
export type { StoreIndex } from "./core/index/index.ts";
export { buildIndex, indexDocuments } from "./core/index/index.ts";
export type { Filters } from "./core/index/query.ts";
export { selectDocuments, selectItems } from "./core/index/query.ts";
export type { Resolved } from "./core/index/resolve.ts";
export { findDocument, resolveRef, sectionText } from "./core/index/resolve.ts";
export { renderReport } from "./core/reports/render.ts";
export { writeReports } from "./core/reports/write.ts";
export { builtinRules } from "./core/rules/builtin/index.ts";
export type { Diagnostic } from "./core/rules/diagnostic.ts";
export { hasErrors } from "./core/rules/diagnostic.ts";
export type {
  DocumentRule,
  Finding,
  Level,
  Rule,
  RuleContext,
  StoreRule,
} from "./core/rules/rule.ts";
export { defineRule } from "./core/rules/rule.ts";
export { runRules, unknownRuleIds } from "./core/rules/run.ts";
export type { OpenOptions, Store } from "./core/store/open.ts";
export { openStore } from "./core/store/open.ts";
export type { VerifyOptions, VerifyOutcome, VerifyResult } from "./core/verify/run.ts";
export { verifyDocuments } from "./core/verify/run.ts";
