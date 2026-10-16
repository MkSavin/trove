import { resolve } from "node:path";
import { staleDays } from "../../core/document/freshness.ts";
import type { Diagnostic } from "../../core/rules/diagnostic.ts";
import { runRules, unknownRuleIds } from "../../core/rules/run.ts";
import type { Store } from "../../core/store/open.ts";
import { relativePath } from "../../core/store/paths.ts";
import { isFailure, type VerifyResult, verifyDocuments } from "../../core/verify/run.ts";
import { parse, positiveInteger, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { countSeverities, formatCounts, formatDiagnostics } from "../format/diagnostics.ts";
import { painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";
import { formatVerify } from "../format/verify.ts";
import type { Io } from "../io.ts";
import { openFromFlags } from "../store.ts";

const configWarnings = (store: Store): Diagnostic[] =>
  unknownRuleIds(store.rules, store.index).map((id) => ({
    rule: "config",
    severity: "warn",
    file: relativePath(store.root, store.configPath),
    line: undefined,
    message: `rules: no rule ${id}`,
    hint: undefined,
  }));

const documentTable = (store: Store): string[] =>
  formatTable([
    ["document", "status", "checked", "stale"],
    ...store.index.documents.map((doc) => {
      const days = staleDays(doc, store.config, store.index.today);
      return [doc.rel, doc.meta.status ?? "—", doc.meta.checked ?? "—", days ? `${days} d` : ""];
    }),
  ]);

const summary = (store: Store): string => {
  const { documents, items } = store.index;
  const ledgers = documents.filter((doc) => doc.ledger).length;
  const open = items.filter((item) => item.open).length;
  return `${documents.length} documents · ${ledgers} ledgers · ${open} open items`;
};

const printResult = (
  store: Store,
  diagnostics: readonly Diagnostic[],
  verified: readonly VerifyResult[] | undefined,
  all: boolean,
  io: Io,
): void => {
  const paint = painter(io);
  if (all) {
    for (const line of documentTable(store)) io.print(line);
    io.print();
  }
  for (const line of formatDiagnostics(diagnostics, paint)) io.print(line);

  const counts = countSeverities(diagnostics);
  const mark = counts.error > 0 ? paint("red", "✖") : paint("green", "✔");
  io.print(`${mark} ${formatCounts(counts)} · ${summary(store)}`);
  if (verified) {
    io.print();
    for (const line of formatVerify(verified, paint)) io.print(line);
  }
};

export const check: Command = {
  name: "check",
  summary: "Check headers, ledgers and placement of every document",
  usage: "trove check [file] [--all] [--json] [--verify [--jobs N] [--timeout SECONDS]]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      verify: { type: "boolean", default: false },
      jobs: { type: "string" },
      timeout: { type: "string" },
    });
    const store = await openFromFlags(values, io);
    const [file] = positionals;
    const only = file === undefined ? undefined : relativePath(store.root, resolve(io.cwd, file));

    const diagnostics = [...configWarnings(store), ...runRules(store.rules, store.index)].filter(
      (diagnostic) => only === undefined || diagnostic.file === only,
    );

    const timeout = positiveInteger("timeout", values.timeout);
    const verified = values.verify
      ? await verifyDocuments(store.index, {
          only,
          jobs: positiveInteger("jobs", values.jobs),
          timeoutMs: timeout === undefined ? undefined : timeout * 1000,
        })
      : undefined;

    if (values.json) {
      io.print(JSON.stringify({ summary: summary(store), diagnostics, verify: verified }, null, 2));
    } else {
      printResult(store, diagnostics, verified, values.all, io);
    }
    const failed = countSeverities(diagnostics).error > 0 || (verified?.some(isFailure) ?? false);
    return failed ? EXIT.failed : EXIT.ok;
  },
};
