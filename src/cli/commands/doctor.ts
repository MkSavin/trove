import { diagnose, type StoreHealth } from "../../core/store/doctor.ts";
import { parse } from "../args.ts";
import { type Command, EXIT } from "../command.ts";
import { type Paint, painter } from "../format/style.ts";
import { formatTable } from "../format/table.ts";

const yesNo = (value: boolean, paint: Paint): string =>
  value ? paint("green", "yes") : paint("yellow", "no");

const storeRows = (store: StoreHealth, paint: Paint): string[][] => [
  [paint("bold", store.name), store.root],
  ["  present", yesNo(store.present, paint)],
  ...(store.problem ? [["  problem", paint("red", store.problem)]] : []),
  ...(store.present && !store.problem
    ? [
        ["  remote", store.remote ?? "none (local)"],
        ["  sync", store.sync ?? "off"],
        ["  documents", String(store.documents)],
        ["  errors", store.errors ? paint("red", String(store.errors)) : paint("green", "0")],
      ]
    : []),
];

export const doctor: Command = {
  name: "doctor",
  summary: "Show the project, its stores and their health",
  usage: "trove doctor [--json]",
  run: async (argv, io) => {
    const { values } = parse(argv, { json: { type: "boolean", default: false } });
    const health = await diagnose(io.cwd);
    if (values.json) {
      io.print(JSON.stringify(health, null, 2));
      return EXIT.ok;
    }
    const paint = painter(io);
    const rows = [
      ["project", health.project],
      [".trove.yaml", yesNo(health.pointer, paint)],
      ["registered", yesNo(health.registered, paint)],
      ...health.stores.flatMap((store) => storeRows(store, paint)),
    ];
    for (const line of formatTable(rows)) io.print(line);
    if (health.stores.length === 0)
      io.print(paint("yellow", "no stores: run trove init or trove clone"));
    const healthy = health.stores.every(
      (store) => store.present && !store.problem && !store.errors,
    );
    return healthy ? EXIT.ok : EXIT.failed;
  },
};
