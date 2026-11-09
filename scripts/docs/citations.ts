import type { Repo, SourceFile } from "./repo.ts";

export type Citation = { id: string; where: string };

const FENCE = /^\s*(`{3,}|~{3,})/;
const CHECKED = /\bChecked: ((?:INV:[\w/-]+(?:,\s*)?)+)/g;
const ID = /INV:([\w/-]+)/g;

/** The text with fenced code blanked, keeping line numbers: examples are not claims. */
export const withoutFences = (text: string): string => {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        fenced = !fenced;
        return "";
      }
      return fenced ? "" : line;
    })
    .join("\n");
};

const citationsIn = (file: SourceFile): Citation[] =>
  withoutFences(file.text)
    .split("\n")
    .flatMap((line, i) =>
      [...line.matchAll(CHECKED)].flatMap(([, list = ""]) =>
        [...list.matchAll(ID)].map(([, id = ""]) => ({ id, where: `${file.path}:${i + 1}` })),
      ),
    );

export const findCitations = ({ agents, docs }: Repo): Citation[] =>
  [...(agents ? [agents] : []), ...docs].flatMap(citationsIn);
