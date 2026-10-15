import { copyToClipboard } from "../../core/adapters/clipboard.ts";
import { TroveError } from "../../core/errors.ts";
import { findDocument } from "../../core/index/resolve.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { openFromFlags } from "../store.ts";

export const prompt: Command = {
  name: "prompt",
  summary: "Print a prompt's task text, or copy it to the clipboard",
  usage: "trove prompt <name> [--copy]",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, {
      ...STORE_OPTIONS,
      copy: { type: "boolean", default: false },
    });
    const [name] = positionals;
    if (name === undefined) throw new TroveError("prompt what? pass a prompt file name");

    const store = await openFromFlags(values, io);
    const doc = findDocument(store.index, name);
    if (!doc) throw new TroveError(`no document ${name}`);
    if (!doc.prompt) throw new TroveError(`${doc.rel} has no <!-- prompt --> marker`);

    if (values.copy) {
      await copyToClipboard(doc.prompt.text);
      io.print(`${doc.name}: ${doc.prompt.text.split("\n").length - 1} lines copied`);
    } else {
      io.write(doc.prompt.text);
    }
    return EXIT.ok;
  },
};
