import type { AppliedChange, Outcome } from "../../core/ops/apply.ts";
import { type ChangedFile, changedFile } from "../../core/ops/summary.ts";
import { lineDiff } from "../../core/text/diff.ts";
import { EXIT } from "../command.ts";
import type { Io } from "../io.ts";
import { formatDiagnostics } from "./diagnostics.ts";
import { plural } from "./plural.ts";
import { type Paint, painter } from "./style.ts";

const MARKS = { added: "A", modified: "M", deleted: "D", moved: "R" } as const;

const marker = ({ status, path, from }: ChangedFile): string =>
  from ? `R ${from} → ${path}` : `${MARKS[status]} ${path}`;

const diffLines = (change: AppliedChange, paint: Paint): string[] =>
  lineDiff(change.previous ?? "", change.text ?? "").map(({ kind, line, text }) =>
    paint(kind === "+" ? "green" : "red", `    ${kind}${String(line).padStart(5)} │ ${text}`),
  );

/** Prints what changed, or why nothing was written; `--dry-run` adds line diffs. */
export const printOutcome = async (outcome: Outcome, io: Io, dryRun: boolean): Promise<number> => {
  const paint = painter(io);
  if (outcome.introduced.length > 0) {
    for (const line of formatDiagnostics(outcome.introduced, paint)) io.print(line);
    io.print(
      paint("red", `✖ not written: the change adds ${plural(outcome.introduced.length, "error")}`),
    );
    return EXIT.failed;
  }

  for (const change of outcome.changes) {
    io.print(`  ${marker(changedFile(change))}`);
    if (dryRun) for (const line of diffLines(change, paint)) io.print(line);
  }
  for (const note of outcome.notes) io.print(paint("dim", `  ${note}`));
  io.print(dryRun ? paint("yellow", "dry run: nothing written") : paint("green", "✔ done"));
  return EXIT.ok;
};
