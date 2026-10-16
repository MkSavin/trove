import { availableParallelism } from "node:os";
import type { Document } from "../document/document.ts";
import type { StoreIndex } from "../index/index.ts";
import { type Verification, writeVerifications } from "./cache.ts";
import { expandCommand, verifyCommandOf } from "./command.ts";
import { mapLimit } from "./pool.ts";
import { runShell, type ShellResult } from "./shell.ts";

/** `ok`: the state the document describes still holds; `skipped`: a root it needs is not on this machine. */
export type VerifyOutcome = "ok" | "failed" | "timed-out" | "skipped";

export type VerifyResult = {
  rel: string;
  command: string;
  outcome: VerifyOutcome;
  /** Exit code, timeout or the reason it did not run. */
  detail: string | undefined;
  output: string;
  ms: number;
};

export type VerifyOptions = {
  /** Store-relative path of the one document to verify. */
  only?: string | undefined;
  jobs?: number | undefined;
  timeoutMs?: number | undefined;
};

export const isFailure = (result: VerifyResult): boolean =>
  result.outcome === "failed" || result.outcome === "timed-out";

export const DEFAULT_JOBS = Math.min(4, availableParallelism());
export const DEFAULT_TIMEOUT_MS = 60_000;

const notRun = (
  doc: Document,
  command: string,
  outcome: VerifyOutcome,
  detail: string,
): VerifyResult => ({ rel: doc.rel, command, outcome, detail, output: "", ms: 0 });

const judge = (run: ShellResult, timeoutMs: number): Pick<VerifyResult, "outcome" | "detail"> => {
  if (run.timedOut)
    return { outcome: "timed-out", detail: `timed out after ${timeoutMs / 1000} s` };
  return run.code === 0
    ? { outcome: "ok", detail: undefined }
    : { outcome: "failed", detail: `exit ${run.code}` };
};

const verifyOne = async (
  doc: Document,
  command: string,
  index: StoreIndex,
  timeoutMs: number,
): Promise<VerifyResult> => {
  const expanded = expandCommand(command, index.root, index.config);
  switch (expanded.kind) {
    case "unknown-root":
      return notRun(doc, command, "failed", `no root ${expanded.root} in roots`);
    case "missing-root":
      return notRun(doc, command, "skipped", `root ${expanded.root} is not checked out here`);
  }
  const run = await runShell(expanded.command, { cwd: index.root, timeoutMs });
  return { rel: doc.rel, command, ...judge(run, timeoutMs), output: run.output, ms: run.ms };
};

const toVerification = (result: VerifyResult, date: string, at: string): Verification => ({
  ok: result.outcome === "ok",
  date,
  at,
  command: result.command,
});

/** Runs the `verify-cmd` of every document in work and keeps the results for the `verified` column. */
export const verifyDocuments = async (
  index: StoreIndex,
  { only, jobs = DEFAULT_JOBS, timeoutMs = DEFAULT_TIMEOUT_MS }: VerifyOptions = {},
): Promise<VerifyResult[]> => {
  const targets = index.documents.flatMap((doc) => {
    const command = verifyCommandOf(doc);
    const wanted = doc.place === "work" && (only === undefined || doc.rel === only);
    return command && wanted ? [{ doc, command }] : [];
  });
  const results = await mapLimit(targets, jobs, ({ doc, command }) =>
    verifyOne(doc, command, index, timeoutMs),
  );
  const at = new Date().toISOString();
  const ran = results.filter((result) => result.outcome !== "skipped");
  if (ran.length === 0) return results;
  await writeVerifications(
    index.root,
    new Map(ran.map((result) => [result.rel, toVerification(result, index.today, at)])),
    new Set(index.byRel.keys()),
  );
  return results;
};
