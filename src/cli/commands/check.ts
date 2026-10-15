import { resolve } from "node:path";
import { staleDays } from "../../core/document/freshness.ts";
import type { Diagnostic } from "../../core/rules/diagnostic.ts";
import { runRules, unknownRuleIds } from "../../core/rules/run.ts";
import type { Store } from "../../core/store/open.ts";
import { relativePath } from "../../core/store/paths.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { countSeverities, formatCounts, formatDiagnostics } from "../format/diagnostics.ts";
import { painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";
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
};

export const check: Command = {
  name: "check",
  summary: "Check headers, ledgers and placement of every document",
  usage: "trove check [file] [--all] [--json]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    });
    const store = await openFromFlags(values, io);
    const [file] = positionals;
    const only = file === undefined ? undefined : relativePath(store.root, resolve(io.cwd, file));

    const diagnostics = [...configWarnings(store), ...runRules(store.rules, store.index)].filter(
      (diagnostic) => only === undefined || diagnostic.file === only,
    );

    if (values.json) {
      io.print(JSON.stringify({ summary: summary(store), diagnostics }, null, 2));
    } else {
      printResult(store, diagnostics, values.all, io);
    }
    return countSeverities(diagnostics).error > 0 ? EXIT.failed : EXIT.ok;
  },
};
