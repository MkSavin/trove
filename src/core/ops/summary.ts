import type { AppliedChange } from "./apply.ts";

export type FileStatus = "added" | "modified" | "deleted" | "moved";

export type ChangedFile = { status: FileStatus; path: string; from: string | undefined };

const statusOf = (change: AppliedChange): FileStatus => {
  if (change.from) return "moved";
  if (change.text === undefined) return "deleted";
  return change.previous === undefined ? "added" : "modified";
};

export const changedFile = (change: AppliedChange): ChangedFile => ({
  status: statusOf(change),
  path: change.rel,
  from: change.from,
});
