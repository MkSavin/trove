import type { Anchor } from "./anchors.ts";
import { findCitations } from "./citations.ts";
import type { Repo } from "./repo.ts";

const ID = /^([a-z0-9-]+)\/[a-z0-9]+-[a-z0-9]+$/;
const TEST_CALL = /^\s*(?:test|it)(?:\.\w+)*\(/;

const shapeProblems = ({ id, file, line }: Anchor): string[] => {
  const area = ID.exec(id)?.[1];
  if (!area) return [`${file.path}:${line}: INV:${id} is not <area>/<two-words>`];
  return file.path === `test/${area}.test.ts`
    ? []
    : [`${file.path}:${line}: INV:${id}: the area must be the test file's name`];
};

/** Several anchors may stack over one test: each sits on the line above the next. */
const sitsAboveTest = (anchor: Anchor, stacked: ReadonlySet<number>): boolean => {
  const lines = anchor.file.text.split("\n");
  let next = anchor.comment.endLine + 1;
  while (stacked.has(next)) next++;
  return anchor.comment.kind === "line" && TEST_CALL.test(lines[next - 1] ?? "");
};

const placementProblems = (anchors: readonly Anchor[]): string[] => {
  const byFile = Map.groupBy(anchors, (anchor) => anchor.file.path);
  return anchors.flatMap((anchor) => {
    const stacked = new Set(byFile.get(anchor.file.path)?.map(({ line }) => line));
    return sitsAboveTest(anchor, stacked)
      ? []
      : [`${anchor.file.path}:${anchor.line}: INV:${anchor.id} must sit directly above test(...)`];
  });
};

const duplicateProblems = (anchors: readonly Anchor[]): string[] =>
  [...Map.groupBy(anchors, (anchor) => anchor.id)].flatMap(([id, same]) =>
    same.slice(1).map(({ file, line }) => `${file.path}:${line}: duplicate INV:${id}`),
  );

export const checkInvariants = (repo: Repo, all: readonly Anchor[]): string[] => {
  const anchors = all.filter((anchor) => anchor.namespace === "INV");
  const known = new Set(anchors.map((anchor) => anchor.id));
  const citations = findCitations(repo);
  const cited = new Set(citations.map((citation) => citation.id));
  return [
    ...anchors.flatMap(shapeProblems),
    ...placementProblems(anchors),
    ...duplicateProblems(anchors),
    ...citations
      .filter(({ id }) => !known.has(id))
      .map(({ id, where }) => `${where}: cites INV:${id}, which no test holds`),
    ...anchors
      .filter(({ id }) => !cited.has(id))
      .map(({ id, file, line }) => `${file.path}:${line}: INV:${id} is cited by no document`),
  ];
};
