import { basename, join } from "node:path";
import { TroveError } from "../../core/errors.ts";
import { toplevel } from "../../core/git/git.ts";
import {
  isLanguage,
  LANGUAGES,
  type Language,
  systemLanguage,
} from "../../core/presets/presets.ts";
import { type InitResult, initStore } from "../../core/store/init.ts";
import { POINTER_FILE } from "../../core/store/pointer.ts";
import { troveHome } from "../../core/store/registry.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";
import type { Io } from "../io.ts";
import { addClients, parseClients } from "./client.ts";

const NONE = "none";

export const INIT_OPTIONS = {
  path: { type: "string" },
  remote: { type: "string" },
  lang: { type: "string" },
  name: { type: "string" },
  "no-git": { type: "boolean", default: false },
  yes: { type: "boolean", short: "y", default: false },
  client: { type: "string", multiple: true },
} as const;

type Answers = { path: string | undefined; remote: string | undefined; language: Language };

/** At most three questions, each with a default; flags answer them without asking. */
const askMissing = async (
  values: {
    path?: string | undefined;
    remote?: string | undefined;
    lang?: string | undefined;
    yes: boolean;
  },
  io: Io,
): Promise<Answers> => {
  const ask = io.interactive && !values.yes;
  const project = basename((await toplevel(io.cwd)) ?? io.cwd);
  const path = values.path ?? (ask ? io.ask("Store folder", `../${project}-trove`) : undefined);
  const remote = values.remote ?? (ask ? io.ask("Remote repository", NONE) : undefined);
  const lang =
    values.lang ??
    (ask ? io.ask(`Language (${LANGUAGES.join("/")})`, systemLanguage()) : systemLanguage());
  if (!isLanguage(lang)) throw new TroveError(`language must be one of ${LANGUAGES.join(", ")}`);
  return { path, remote: remote === NONE ? undefined : remote, language: lang };
};

export const printInit = (result: InitResult, io: Io): void => {
  const paint = painter(io);
  io.print(paint("green", `✔ store ${result.entry.name} created at ${result.store}`));
  const rows = [
    ["project", result.project],
    ["pointer", `${POINTER_FILE}: commit it so teammates can run trove clone`],
    ["registry", join(troveHome(), "registry.yaml")],
    ["git", result.committed ? "initial commit made, pre-commit runs trove check" : "no commit"],
    ["next", 'trove doc new audit "<topic>" --scope <folder>'],
  ];
  for (const line of formatTable(rows)) io.print(`  ${line}`);
  for (const warning of result.warnings) io.print(paint("yellow", `  ! ${warning}`));
};

export const init: Command = {
  name: "init",
  summary: "Create a store for the current project, link and register it",
  usage:
    "trove init [--path DIR] [--remote URL] [--lang en|ru] [--client claude|cursor|codex]... [--no-git] [--yes]",
  run: async (argv, io) => {
    const { values } = parse(argv, INIT_OPTIONS);
    const answers = await askMissing(values, io);
    const result = await initStore({
      cwd: io.cwd,
      ...answers,
      name: values.name,
      git: !values["no-git"],
    });
    printInit(result, io);
    await addClients(parseClients(values.client ?? []), io);
    return EXIT.ok;
  },
};
