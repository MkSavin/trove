import type { Diagnostic } from "../../core/rules/diagnostic.ts";
import type { Level } from "../../core/rules/rule.ts";
import { plural } from "./plural.ts";
import type { Paint } from "./style.ts";
import { formatTable } from "./table.ts";

const SEVERITY_STYLE = { error: "red", warn: "yellow", info: "cyan" } as const;

const rowOf = (diagnostic: Diagnostic, paint: Paint): string[] => [
  paint("dim", String(diagnostic.line ?? "")),
  paint(SEVERITY_STYLE[diagnostic.severity], diagnostic.severity),
  diagnostic.message,
  paint("dim", diagnostic.rule),
];

const formatGroup = (group: readonly Diagnostic[], paint: Paint): string[] => {
  const lines = formatTable(group.map((diagnostic) => rowOf(diagnostic, paint)));
  return group.flatMap((diagnostic, i) => [
    `  ${lines[i]}`,
    ...(diagnostic.hint ? [paint("dim", `      ↳ ${diagnostic.hint}`)] : []),
  ]);
};

/** Grouped by file, eslint-style: `line  severity  message  rule`. */
export const formatDiagnostics = (diagnostics: readonly Diagnostic[], paint: Paint): string[] =>
  [...Map.groupBy(diagnostics, (diagnostic) => diagnostic.file)].flatMap(([file, group]) => [
    paint("underline", file),
    ...formatGroup(group, paint),
    "",
  ]);

export const countSeverities = (diagnostics: readonly Diagnostic[]): Record<Level, number> => ({
  error: diagnostics.filter((d) => d.severity === "error").length,
  warn: diagnostics.filter((d) => d.severity === "warn").length,
  info: diagnostics.filter((d) => d.severity === "info").length,
});

export const formatCounts = ({ error, warn, info }: Record<Level, number>): string =>
  [plural(error, "error"), plural(warn, "warning"), `${info} info`].join(", ");
