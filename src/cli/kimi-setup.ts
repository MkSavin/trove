import { addKimiHooks } from "../clients/kimi/hooks.ts";
import { findStores } from "../core/store/doctor.ts";
import { openConfig } from "../core/store/open.ts";
import { ignoreArchive, SEARCH_IGNORE_FILE } from "../core/store/search-ignore.ts";
import { painter } from "./format/style.ts";
import type { Io } from "./io.ts";

/** A store missing or unreadable here is simply skipped: this is a backfill, not a check. */
const backfillIgnore = async (io: Io): Promise<void> => {
  const paint = painter(io);
  const { entries } = await findStores(io.cwd).catch(() => ({ entries: [] }));
  for (const { name, root } of entries) {
    const changed = await openConfig({ cwd: root, store: root }).then(
      ({ config }) => ignoreArchive(root, config),
      () => false,
    );
    if (changed) {
      io.print(
        paint(
          "green",
          `✔ store ${name}: ${SEARCH_IGNORE_FILE} keeps the archive out of searches, not committed yet`,
        ),
      );
    }
  }
};

const writeHooks = async (io: Io): Promise<void> => {
  const paint = painter(io);
  const { path, added } = await addKimiHooks();
  io.print(
    paint("green", added > 0 ? `✔ kimi hooks added to ${path}` : `✔ kimi hooks already in ${path}`),
  );
  io.print(paint("yellow", "  That is your user-level config, for every project on this machine."));
  io.print(paint("yellow", "  Kimi Code hooks are beta."));
};

export const finishKimi = async (io: Io, hooks: boolean): Promise<void> => {
  await backfillIgnore(io);
  if (hooks) await writeHooks(io);
};
