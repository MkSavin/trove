import { toplevel } from "../../core/git/git.ts";
import { forgetProject } from "../../core/store/registry.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";

export const forget: Command = {
  name: "forget",
  summary: "Remove the project from this machine's registry; files stay",
  usage: "trove forget",
  run: async (argv, io) => {
    parse(argv, {});
    const project = (await toplevel(io.cwd)) ?? io.cwd;
    const removed = await forgetProject(project);
    io.print(removed ? `forgot ${project}` : `${project} was not registered`);
    return EXIT.ok;
  },
};
