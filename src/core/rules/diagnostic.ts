import { compareText } from "../text/compare.ts";
import type { Level } from "./rule.ts";

export type Diagnostic = {
  rule: string;
  severity: Level;
  file: string;
  line: number | undefined;
  message: string;
  hint: string | undefined;
};

export const compareDiagnostics = (a: Diagnostic, b: Diagnostic): number =>
  compareText(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || compareText(a.rule, b.rule);

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error");
