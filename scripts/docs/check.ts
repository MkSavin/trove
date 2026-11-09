import { findAnchors } from "./anchors.ts";
import { checkBudgets } from "./budgets.ts";
import { checkConventions } from "./conventions.ts";
import { checkDocAnchors } from "./doc-anchors.ts";
import { checkInvariants } from "./invariants.ts";
import type { Repo } from "./repo.ts";
import { checkWorkarounds } from "./workarounds.ts";

export const checkDocs = (repo: Repo): string[] => {
  const { anchors, problems } = findAnchors(repo.code);
  return [
    ...checkBudgets(repo),
    ...problems,
    ...checkInvariants(repo, anchors),
    ...checkWorkarounds(repo, anchors),
    ...checkDocAnchors(repo, anchors),
    ...checkConventions(repo.code),
  ];
};
