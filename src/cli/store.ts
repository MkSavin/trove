import { openStore, type Store } from "../core/store/open.ts";
import type { Io } from "./io.ts";

export type StoreFlags = { store?: string | undefined; config?: string | undefined };

export const openFromFlags = (flags: StoreFlags, io: Io): Promise<Store> =>
  openStore({ cwd: io.cwd, store: flags.store ?? process.env.TROVE_STORE, config: flags.config });
