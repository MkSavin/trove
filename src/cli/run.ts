import packageJson from "../../package.json" with { type: "json" };
import { TroveError } from "../core/errors.ts";
import { type Command, EXIT } from "./command.ts";
import { check } from "./commands/check.ts";
import { client } from "./commands/client.ts";
import { clone } from "./commands/clone.ts";
import { doc } from "./commands/doc.ts";
import { doctor } from "./commands/doctor.ts";
import { exportCommand } from "./commands/export.ts";
import { forget } from "./commands/forget.ts";
import { hook } from "./commands/hook.ts";
import { init } from "./commands/init.ts";
import { item } from "./commands/item.ts";
import { links } from "./commands/links.ts";
import { mcp } from "./commands/mcp.ts";
import { migrate } from "./commands/migrate.ts";
import { prompt } from "./commands/prompt.ts";
import { query } from "./commands/query.ts";
import { refresh } from "./commands/refresh.ts";
import { regulationCommand } from "./commands/regulation.ts";
import { remote } from "./commands/remote.ts";
import { report } from "./commands/report.ts";
import { resync } from "./commands/resync.ts";
import { rules } from "./commands/rules.ts";
import { schema } from "./commands/schema.ts";
import { serve } from "./commands/serve.ts";
import { show } from "./commands/show.ts";
import { store } from "./commands/store.ts";
import { summary } from "./commands/summary.ts";
import { sync } from "./commands/sync.ts";
import { formatTable } from "./format/table.ts";
import type { Io } from "./io.ts";

const COMMANDS: readonly Command[] = [
  init,
  clone,
  migrate,
  resync,
  store,
  remote,
  client,
  doctor,
  forget,
  check,
  report,
  refresh,
  query,
  summary,
  show,
  prompt,
  links,
  exportCommand,
  serve,
  doc,
  item,
  sync,
  mcp,
  hook,
  regulationCommand,
  rules,
  schema,
];

const GLOBAL_FLAGS = [
  ["--store <name|dir>", "store of the project by name, or a folder; default: found from here"],
  ["--config <file>", "config file; default: <store>/trove.yaml"],
  ["-h, --help", "help for trove or a command"],
  ["-v, --version", "print the version"],
];

const help = (io: Io): void => {
  io.print("trove — a plain-Markdown archive of audits, plans and specs\n");
  io.print("Usage: trove <command> [options]\n");
  io.print("Commands:");
  for (const line of formatTable(COMMANDS.map((c) => [c.name, c.summary]))) io.print(`  ${line}`);
  io.print("\nOptions:");
  for (const line of formatTable(GLOBAL_FLAGS)) io.print(`  ${line}`);
};

const isHelp = (arg: string | undefined): boolean => arg === "-h" || arg === "--help";

export const run = async (argv: readonly string[], io: Io): Promise<number> => {
  const [name, ...rest] = argv;
  if (name === undefined || isHelp(name) || name === "help") {
    help(io);
    return EXIT.ok;
  }
  if (name === "-v" || name === "--version") {
    io.print(packageJson.version);
    return EXIT.ok;
  }

  const command = COMMANDS.find((candidate) => candidate.name === name);
  if (!command) {
    io.error(`unknown command ${name}; see trove --help`);
    return EXIT.usage;
  }
  if (rest.some(isHelp)) {
    io.print(`${command.summary}\n\nUsage: ${command.usage}`);
    return EXIT.ok;
  }

  try {
    return await command.run(rest, io);
  } catch (error) {
    if (!(error instanceof TroveError)) throw error;
    io.error(`trove ${name}: ${error.message}`);
    return EXIT.usage;
  }
};
