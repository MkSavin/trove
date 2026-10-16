import { configJsonSchemaText } from "../../core/config/json-schema.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";

export const schema: Command = {
  name: "schema",
  summary: "Print the JSON Schema of trove.yaml, for editors and CI",
  usage: "trove schema",
  run: async (argv, io) => {
    parse(argv, {});
    io.write(configJsonSchemaText());
    return EXIT.ok;
  },
};
