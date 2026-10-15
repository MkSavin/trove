import { fieldSpecs, labelOf } from "../config/vocabulary.ts";
import { type Document, stemOf } from "../document/document.ts";
import { setField } from "../edit/front-matter.ts";
import { rebaseLinks, retargetLinks } from "../edit/links.ts";
import { applyPatches, type Patch, replace } from "../edit/patch.ts";
import { setStatusLine } from "../edit/status-line.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { mentionsOf } from "./find.ts";
import { placementOf } from "./naming.ts";
import type { Change, Plan } from "./plan.ts";

const TITLE = /^# /;

/** The stem without the old type's prefix, under the new type's prefix: RESEARCH_X → PLAN_X. */
const renamed = (index: StoreIndex, doc: Document, type: string): string => {
  const stem = stemOf(doc);
  const old = doc.type ? placementOf(index.config, doc.type).prefix : "";
  const bare = old && stem.startsWith(old) ? stem.slice(old.length) : stem;
  return `${placementOf(index.config, type).prefix}${bare}`;
};

/** Keeps the status when the new type allows it, else starts the type's way. */
const statusFor = (index: StoreIndex, doc: Document, type: string): string | undefined => {
  const kind = index.config.types[type];
  const allowed = kind?.statuses;
  if (!allowed || (doc.status !== undefined && allowed.includes(doc.status))) return undefined;
  return kind?.initial ?? allowed[0];
};

const titlePatch = (doc: Document, from: string, to: string): Patch[] => {
  const heading = doc.headings.find((candidate) => candidate.level === 1);
  const line = heading ? doc.lines[heading.line - 1] : undefined;
  if (!line || !TITLE.test(line.text) || !line.text.slice(2).startsWith(from)) return [];
  return [replace({ start: line.start + 2, end: line.start + 2 + from.length }, to)];
};

/** Other documents' `refs` fields that name the old file, renamed to the new one. */
const refPatches = (index: StoreIndex, other: Document, from: string, to: string): Patch[] => {
  const specs = fieldSpecs(index.config, other.typeConfig);
  return [...(other.frontMatter?.fields.values() ?? [])]
    .filter(
      ({ key, value }) =>
        specs[key]?.format === "refs" && value.split(",").some((ref) => ref.trim() === from),
    )
    .map(({ key, value }) =>
      setField(
        other,
        key,
        value
          .split(",")
          .map((ref) => (ref.trim() === from ? to : ref.trim()))
          .join(", "),
      ),
    );
};

/**
 * Turns a document into another type: new folder and prefix, a status the type allows, the
 * title, its links and every link and reference to it follow.
 */
export const retypePlan = (index: StoreIndex, doc: Document, type: string): Plan => {
  if (!index.config.types[type]) throw new TroveError(`unknown type ${type}`);
  if (doc.type === type) throw new TroveError(`${doc.rel} is already ${type}`);

  const name = renamed(index, doc, type);
  if (index.byName.has(`${name}.md`) && `${name}.md` !== doc.name) {
    throw new TroveError(`${name}.md already exists`);
  }
  const { folder } = placementOf(index.config, type);
  const archive = doc.place === "archive" ? `${index.config.archive.folder}/` : "";
  const target = `${archive}${folder ? `${folder}/` : ""}${name}.md`;
  const status = statusFor(index, doc, type);
  const label = status === undefined ? undefined : labelOf(index.config.statuses, status);

  const moved = applyPatches(doc.text, [
    setField(doc, "type", type),
    ...(label ? [setField(doc, "status", label), ...setStatusLine(doc, { status: label })] : []),
    ...titlePatch(doc, stemOf(doc), name),
    ...rebaseLinks(doc, target),
  ]);
  const others = index.documents.flatMap((other): Change[] => {
    if (other.rel === doc.rel) return [];
    const patches = [
      ...retargetLinks(other, doc.rel, target),
      ...refPatches(index, other, doc.name, `${name}.md`),
    ];
    return patches.length > 0 ? [{ rel: other.rel, text: applyPatches(other.text, patches) }] : [];
  });

  const mentions = mentionsOf(index, stemOf(doc), doc.rel);
  return {
    changes: [
      { rel: target, text: moved, from: target === doc.rel ? undefined : doc.rel },
      ...others,
    ],
    notes: [
      `${doc.rel} → ${target}`,
      ...(mentions.length > 0
        ? [`${stemOf(doc)} is still named in the text of ${mentions.join(", ")}`]
        : []),
    ],
    message: `docs: retype ${stemOf(doc)} as ${type}`,
  };
};
