import { isFailure, type VerifyOutcome, type VerifyResult } from "../../core/verify/run.ts";
import type { Paint } from "./style.ts";
import { formatTable } from "./table.ts";

const OUTPUT_TAIL = 10;

const MARKS: Readonly<Record<VerifyOutcome, [mark: string, style: "green" | "red" | "dim"]>> = {
  ok: ["✔", "green"],
  failed: ["✖", "red"],
  "timed-out": ["✖", "red"],
  skipped: ["–", "dim"],
};

const duration = (ms: number): string => {
  if (ms === 0) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
};

const rowOf = (result: VerifyResult, paint: Paint): string[] => {
  const [mark, style] = MARKS[result.outcome];
  return [paint(style, mark), result.rel, result.detail ?? "ok", paint("dim", duration(result.ms))];
};

const outputTail = (result: VerifyResult, paint: Paint): string[] =>
  isFailure(result)
    ? result.output
        .split(/\r?\n/)
        .slice(-OUTPUT_TAIL)
        .filter(Boolean)
        .map((line) => paint("dim", `      │ ${line}`))
    : [];

const summaryLine = (results: readonly VerifyResult[], paint: Paint): string => {
  const count = (outcome: VerifyOutcome) => results.filter((r) => r.outcome === outcome).length;
  const failed = results.filter(isFailure).length;
  const parts = [`${count("ok")} ok`, `${failed} failed`, `${count("skipped")} skipped`];
  const mark = failed > 0 ? paint("red", "✖") : paint("green", "✔");
  return `${mark} verify: ${parts.join(", ")}`;
};

export const formatVerify = (results: readonly VerifyResult[], paint: Paint): string[] => {
  if (results.length === 0) return ["verify: no document in work has verify-cmd"];
  const lines = formatTable(results.map((result) => rowOf(result, paint)));
  return [
    ...results.flatMap((result, i) => [`  ${lines[i]}`, ...outputTail(result, paint)]),
    summaryLine(results, paint),
  ];
};
