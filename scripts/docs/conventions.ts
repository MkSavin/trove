import { type Comment, scanComments } from "./comments.ts";
import type { SourceFile } from "./repo.ts";

const NON_ENGLISH = /(?!\p{Script=Latin})\p{L}/u;
const INLINE_CODE = /`[^`]*`/g;
const DOC_REFERENCES = [
  /§/,
  /\b(?:SPEC|PLAN|AUDIT|RESEARCH)_[A-Z0-9_]+\b/,
  /\b(?!UTF|SHA|ISO|RFC)[A-Z]{2,}-\d+\b/,
  /\b(?:see|per|according to)\s+(?:the\s+)?(?:spec|plan|audit|ticket|issue)\b/i,
  /(?:^|\s)\.agents\//,
];
const MAX_LINE_RUN = 3;
const MAX_BLOCK_LINES = 10;

const scannedByConventions = (path: string): boolean =>
  path.startsWith("src/") || path.startsWith("scripts/");

const textProblems = (path: string, comment: Comment): string[] => {
  const where = `${path}:${comment.line}`;
  const prose = comment.text.replace(INLINE_CODE, "");
  return [
    ...(NON_ENGLISH.test(comment.text) ? [`${where}: comments are in English`] : []),
    ...(DOC_REFERENCES.some((pattern) => pattern.test(prose))
      ? [`${where}: no references to specs, plans or tickets in comments`]
      : []),
    ...(comment.kind === "block" && comment.endLine - comment.line + 1 > MAX_BLOCK_LINES
      ? [`${where}: a block comment over ${MAX_BLOCK_LINES} lines`]
      : []),
  ];
};

const runProblems = (path: string, comments: readonly Comment[]): string[] => {
  const problems: string[] = [];
  let run: Comment[] = [];
  const flush = (): void => {
    if (run.length > MAX_LINE_RUN) {
      problems.push(`${path}:${run[0]?.line}: ${run.length} line comments in a row, at most 3`);
    }
    run = [];
  };
  for (const comment of comments) {
    if (comment.kind !== "line" || !comment.alone) {
      flush();
      continue;
    }
    if (run.at(-1)?.line !== comment.line - 1) flush();
    run.push(comment);
  }
  flush();
  return problems;
};

export const checkConventions = (code: readonly SourceFile[]): string[] =>
  code
    .filter(({ path }) => scannedByConventions(path))
    .flatMap(({ path, text }) => {
      const comments = scanComments(text);
      return [
        ...comments.flatMap((comment) => textProblems(path, comment)),
        ...runProblems(path, comments),
      ];
    });
