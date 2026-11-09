import type { Repo, SourceFile } from "./repo.ts";

const AGENTS_LIMIT = 3 * 1024;
const DOC_LIMIT = 8 * 1024;

const overBudget = (file: SourceFile, limit: number, hint: string): string[] => {
  const size = Buffer.byteLength(file.text);
  return size > limit ? [`${file.path}: ${size} bytes, the limit is ${limit}: ${hint}`] : [];
};

export const checkBudgets = ({ agents, docs }: Repo): string[] => [
  ...(agents ? overBudget(agents, AGENTS_LIMIT, "shorten") : ["AGENTS.md is missing"]),
  ...docs.flatMap((doc) => overBudget(doc, DOC_LIMIT, "split by topic")),
];
