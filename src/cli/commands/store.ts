import { TroveError } from "../../core/errors.ts";
import { isLanguage, LANGUAGES, systemLanguage } from "../../core/presets/presets.ts";
import { initStore } from "../../core/store/init.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { defineGroup } from "../group.ts";
import { INIT_OPTIONS, printInit } from "./init.ts";

const storeAdd: Command = {
  name: "add",
  summary: "Add another store to the project, for a team with its own access",
  usage: "trove store add <name> [--scope GLOB]... [--path DIR] [--remote URL] [--lang en|ru]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...INIT_OPTIONS,
      scope: { type: "string", multiple: true },
    });
    const [name] = positionals;
    if (!name) throw new TroveError("store add needs a name");
    const language = values.lang ?? systemLanguage();
    if (!isLanguage(language))
      throw new TroveError(`language must be one of ${LANGUAGES.join(", ")}`);

    const result = await initStore({
      cwd: io.cwd,
      name,
      path: values.path ?? `../${name}-trove`,
      remote: values.remote,
      scope: values.scope,
      language,
      git: !values["no-git"],
      append: true,
    });
    printInit(result, io);
    return EXIT.ok;
  },
};

export const store = defineGroup("store", "Manage the stores of a project", [storeAdd]);
