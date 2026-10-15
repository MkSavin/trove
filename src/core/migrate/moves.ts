export type Change = { path: string; status: string };

export type Move = { from: string; to: string };

const mirror = (path: string, folder: string): string =>
  path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : `${folder}/${path}`;

/** Pairs a path deleted on one side of the archive mirror with the same path added on the other. */
export const pairMoves = (
  changes: readonly Change[],
  folder: string,
): { moves: Move[]; rest: string[] } => {
  const added = new Set(changes.filter((c) => c.status === "A").map((c) => c.path));
  const moves = changes
    .filter((c) => c.status === "D" && added.has(mirror(c.path, folder)))
    .map((c) => ({ from: c.path, to: mirror(c.path, folder) }));
  const paired = new Set(moves.flatMap((move) => [move.from, move.to]));
  return { moves, rest: changes.map((c) => c.path).filter((path) => !paired.has(path)) };
};

/** Turns a `from → to` patch into an edit of `to`; only the header names change. */
export const asEditOf = (patch: string, to: string): string => {
  const lines = patch.split("\n");
  const body = lines.findIndex((line) => line.startsWith("@@") || line.startsWith("GIT binary"));
  const head = lines.slice(0, body < 0 ? lines.length : body).map((line) => {
    if (line.startsWith("diff --git ")) return `diff --git a/${to} b/${to}`;
    if (line.startsWith("--- ")) return `--- a/${to}`;
    if (line.startsWith("+++ ")) return `+++ b/${to}`;
    return line;
  });
  return [...head, ...lines.slice(head.length)].join("\n");
};
