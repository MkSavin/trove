import { join } from "node:path";
import type { Io } from "../src/cli/io.ts";
import { openStore, type Store } from "../src/index.ts";

export const ROOT = join(import.meta.dir, "..");
export const FIXTURE = join(import.meta.dir, "fixtures", "broken");
export const TODAY = "2026-10-15";

export const openFixture = (): Promise<Store> =>
  openStore({ cwd: FIXTURE, store: FIXTURE, today: TODAY });

export type CapturedIo = Io & { stdout: () => string; stderr: () => string };

export const captureIo = (cwd: string = FIXTURE): CapturedIo => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    cwd,
    print: (line = "") => out.push(`${line}\n`),
    write: (text) => out.push(text),
    error: (line) => err.push(`${line}\n`),
    color: false,
    columns: 120,
    interactive: false,
    ask: (_, fallback) => fallback,
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };
};
