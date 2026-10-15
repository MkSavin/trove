import { join } from "node:path";
import { fieldSpecs } from "../config/vocabulary.ts";
import { TroveError } from "../errors.ts";
import type { StoreIndex } from "../index/index.ts";
import { fillTemplate, type NewDocument, renderNewDocument } from "../templates/new-document.ts";
import { documentName, nameBase, placementOf } from "./naming.ts";
import type { Plan } from "./plan.ts";

export type NewDocumentInput = {
  type: string;
  topic: string;
  /** File name stem without the folder prefix; derived from the topic when omitted. */
  name?: string | undefined;
  fields?: Readonly<Record<string, string>> | undefined;
};

const STANDARD = new Set(["type", "status", "date", "checked"]);

export const initialStatus = (index: StoreIndex, type: string): string => {
  const kind = index.config.types[type];
  const first = Object.keys(index.config.statuses).find(
    (key) => key !== index.config.archive.status,
  );
  const status = kind?.initial ?? kind?.statuses?.[0] ?? first;
  if (status === undefined) throw new TroveError("the config declares no statuses");
  return status;
};

/** Item ids need a slug: by default the name without its prefix and underscores, `WEB_1` → `WEB1`. */
const defaultSlug = (name: string, prefix: string): string =>
  name.slice(prefix.length).replaceAll("_", "");

const customTemplate = async (index: StoreIndex, type: string): Promise<string | undefined> => {
  if (!index.config.templates) return undefined;
  const file = Bun.file(join(index.root, index.config.templates, `${type}.md`));
  return (await file.exists()) ? file.text() : undefined;
};

export const newDocument = async (index: StoreIndex, input: NewDocumentInput): Promise<Plan> => {
  const kind = index.config.types[input.type];
  if (!kind) throw new TroveError(`unknown type ${input.type}`);

  const { folder, prefix } = placementOf(index.config, input.type);
  const name = documentName(index, input.type, `${prefix}${input.name ?? nameBase(input.topic)}`);
  const specs = fieldSpecs(index.config, kind);
  const slug = Object.hasOwn(specs, "slug") ? defaultSlug(name, prefix) : undefined;
  const given: Record<string, string | undefined> = { slug, ...input.fields };
  const fields = Object.entries(given).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !STANDARD.has(entry[0]),
  );

  const missing = Object.entries(specs)
    .filter(([key, spec]) => spec.required && !STANDARD.has(key) && given[key] === undefined)
    .map(([key]) => key);
  if (missing.length > 0) throw new TroveError(`${input.type} needs ${missing.join(", ")}`);

  const document: NewDocument = {
    type: input.type,
    name,
    title: input.topic,
    status: initialStatus(index, input.type),
    date: index.today,
    fields,
  };
  const template = await customTemplate(index, input.type);
  const text = template
    ? fillTemplate(template, document, Object.keys(specs))
    : renderNewDocument(index.config, document);
  const rel = folder ? `${folder}/${name}.md` : `${name}.md`;
  return {
    changes: [{ rel, text }],
    notes: [`created ${rel}`],
    message: `docs: add ${name}`,
    tolerate: ["lifecycle"],
  };
};
