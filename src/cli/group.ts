import { TroveError } from "../core/errors.ts";
import type { Command } from "./command.ts";
import { formatTable } from "./format/table.ts";

/** A command like `doc` whose first argument picks one of its subcommands. */
export const defineGroup = (
  name: string,
  summary: string,
  commands: readonly Command[],
): Command => ({
  name,
  summary,
  usage: [
    `trove ${name} <command>`,
    "",
    ...formatTable(commands.map((command) => [command.usage, command.summary])).map(
      (line) => `  ${line}`,
    ),
  ].join("\n"),
  run: (argv, io) => {
    const [sub, ...rest] = argv;
    const command = commands.find((candidate) => candidate.name === sub);
    if (!command) {
      throw new TroveError(
        `${name} what? ${commands.map((candidate) => candidate.name).join(", ")}`,
      );
    }
    return command.run(rest, io);
  },
});
