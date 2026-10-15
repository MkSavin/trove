import type { SyncResult } from "../../core/sync/sync.ts";
import type { Io } from "../io.ts";
import { painter } from "./style.ts";

export const printSync = (result: SyncResult, io: Io): void => {
  const paint = painter(io);
  if (result.commit) {
    const pushed = result.mode === "push" ? (result.pushed ? " · pushed" : " · not pushed") : "";
    io.print(paint("dim", `  committed ${result.commit}${pushed}`));
  }
  for (const warning of result.warnings) io.print(paint("yellow", `  ! ${warning}`));
};
