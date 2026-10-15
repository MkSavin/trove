import { TroveError } from "../../core/errors.ts";
import { addRemote } from "../../core/sync/remote.ts";
import { parse, STORE_OPTIONS } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { painter } from "../format/style.ts";
import { defineGroup } from "../group.ts";
import { openFromFlags } from "../store.ts";

const remoteAdd: Command = {
  name: "add",
  summary: "Connect the store to a remote repository and switch sync to push",
  usage: "trove remote add <url>",
  run: async (argv, io) => {
    const { values, positionals } = parse(argv, STORE_OPTIONS);
    const [url] = positionals;
    if (!url) throw new TroveError("remote add needs a repository url");
    const store = await openFromFlags(values, io);
    const result = await addRemote(store, url);
    const paint = painter(io);
    io.print(paint("green", `✔ origin ${url}, sync: push`));
    if (result.warning) io.print(paint("yellow", `  ! ${result.warning}`));
    return result.pushed ? EXIT.ok : EXIT.failed;
  },
};

export const remote = defineGroup("remote", "Connect the store to a remote repository", [
  remoteAdd,
]);
