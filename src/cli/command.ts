import type { Io } from "./io.ts";

export type Command = {
  name: string;
  summary: string;
  usage: string;
  /** Resolves to the process exit code. */
  run: (argv: readonly string[], io: Io) => Promise<number>;
};

export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;
