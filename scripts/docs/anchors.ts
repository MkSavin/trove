import { type Comment, scanComments } from "./comments.ts";
import { isTestFile, type SourceFile } from "./repo.ts";

const NAMESPACES = ["INV", "WORKAROUND", "DOC"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export type Anchor = {
  namespace: Namespace;
  id: string;
  /** What follows the id on its line. */
  reason: string;
  file: SourceFile;
  comment: Comment;
  line: number;
};

export type Scan = { anchors: readonly Anchor[]; problems: readonly string[] };

const ANCHOR = /@anchor\b\s*(\S*)\s*(.*?)\s*$/;
const TOKEN = /^([A-Z]+):(.+)$/;
const BARE = /(?<!@anchor\s+)\b(?:WORKAROUND|DOC):/;

const isNamespace = (value: string): value is Namespace =>
  NAMESPACES.some((namespace) => namespace === value);

const scanLine = (
  file: SourceFile,
  comment: Comment,
  text: string,
  line: number,
): { anchor?: Anchor; problem?: string } => {
  const where = `${file.path}:${line}`;
  if (BARE.test(text)) return { problem: `${where}: bare namespace: write @anchor before it` };
  const match = ANCHOR.exec(text);
  if (!match) return {};
  const token = TOKEN.exec(match[1] ?? "");
  const namespace = token?.[1] ?? "";
  if (!token || !isNamespace(namespace)) {
    return { problem: `${where}: unknown anchor namespace: use ${NAMESPACES.join(", ")}` };
  }
  if (namespace !== "INV" && isTestFile(file.path)) {
    return { problem: `${where}: ${namespace} anchor in a test file` };
  }
  const reason = match[2] ?? "";
  return { anchor: { namespace, id: token[2] ?? "", reason, file, comment, line } };
};

const scanFile = (file: SourceFile) =>
  scanComments(file.text).flatMap((comment) =>
    comment.text.split("\n").map((text, i) => scanLine(file, comment, text, comment.line + i)),
  );

export const findAnchors = (code: readonly SourceFile[]): Scan => {
  const found = code.flatMap(scanFile);
  return {
    anchors: found.flatMap(({ anchor }) => (anchor ? [anchor] : [])),
    problems: found.flatMap(({ problem }) => (problem ? [problem] : [])),
  };
};
