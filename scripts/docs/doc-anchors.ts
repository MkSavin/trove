import type { Anchor } from "./anchors.ts";
import { DOCS_DIR, type Repo } from "./repo.ts";

/** A module's way in: a class or a factory-like function, not any helper that wants a link. */
const ENTRY_POINT =
  /^export (?:class \w+|const (?:create|open|make|obtain|parse|apply|run|sync|fill)[A-Z]\w*)\b/;

const anchorProblems = (anchor: Anchor, targets: ReadonlySet<string>): string[] => {
  const { id, file, line, comment } = anchor;
  const where = `${file.path}:${line}: DOC:${id}`;
  const next = file.text.split("\n")[comment.endLine] ?? "";
  return [
    ...(targets.has(`${DOCS_DIR}/${id}.md`)
      ? []
      : [`${where}: ${DOCS_DIR}/${id}.md does not exist`]),
    ...(comment.kind === "block" && ENTRY_POINT.test(next)
      ? []
      : [`${where}: only in the JSDoc of a module's entry point`]),
  ];
};

export const checkDocAnchors = (repo: Repo, all: readonly Anchor[]): string[] => {
  const anchors = all.filter((anchor) => anchor.namespace === "DOC");
  const targets = new Set(repo.docs.map((doc) => doc.path));
  return [
    ...anchors.flatMap((anchor) => anchorProblems(anchor, targets)),
    ...[...Map.groupBy(anchors, (anchor) => anchor.id)].flatMap(([id, same]) =>
      same.slice(1).map(({ file, line }) => `${file.path}:${line}: DOC:${id} is anchored twice`),
    ),
  ];
};
