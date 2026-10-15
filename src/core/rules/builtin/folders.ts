import { defineRule, type Finding } from "../rule.ts";

export const folderType = defineRule({
  id: "folder-type",
  level: "warn",
  summary: "Documents in a configured folder have one of its types and prefixes.",
  scope: "document",
  check: (doc, { config }): Finding[] => {
    const folder = doc.folder === undefined ? undefined : config.folders[doc.folder];
    if (!folder || doc.type === undefined) return [];
    return [
      ...(folder.types.includes(doc.type)
        ? []
        : [{ line: 1, message: `${doc.type} does not belong in ${doc.folder}/` }]),
      ...(folder.prefix.some((prefix) => doc.name.startsWith(prefix))
        ? []
        : [{ line: 1, message: `name should start with ${folder.prefix.join(" or ")}` }]),
    ];
  },
});
