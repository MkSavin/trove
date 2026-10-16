import { join } from "node:path";
import { CONFIG_FILE, parseConfig } from "../config/load.ts";
import type { ConfigInput } from "../config/schema.ts";
import { keyOf } from "../config/vocabulary.ts";
import { buildIndex, type StoreIndex } from "../index/index.ts";
import { LANGUAGES, type Language, presetConfig } from "../presets/presets.ts";
import {
  fitFields,
  fitFinished,
  fitIds,
  fitLedger,
  fitReports,
  fitRequired,
  fitStatusLabels,
  fitStatusLines,
  fitTypeStatuses,
} from "./fit.ts";

export type Inferred = { language: Language; text: string; notes: readonly string[] };

const HEADER =
  "# trove store config, from a preset adjusted to the documents found at migration.\n";
const NEW_TYPE = { capabilities: ["status-line", "freshness"] } as const;
const GROUP_HEADING = /^## (.+)$/gm;

const presetOf = (language: Language): ConfigInput =>
  Bun.YAML.parse(presetConfig(language)) as ConfigInput;

const statusesIn = async (root: string, language: Language): Promise<number> => {
  const config = parseConfig(presetConfig(language), language);
  const index = await buildIndex(root, config);
  return index.documents.filter((doc) => doc.status !== undefined).length;
};

/** The preset whose status labels match the most documents. */
const detectLanguage = async (root: string): Promise<Language> => {
  const scores = await Promise.all(LANGUAGES.map((language) => statusesIn(root, language)));
  const best = Math.max(...scores);
  return LANGUAGES[scores.indexOf(best)] ?? "en";
};

const unique = (values: Iterable<string | undefined>): string[] =>
  [...new Set(values)].filter((value): value is string => value !== undefined).sort();

/** Group headings of an existing generated report, in the order people already read them. */
const groupOrder = async (root: string, output: string, groups: readonly string[]) => {
  const file = Bun.file(join(root, output));
  if (!(await file.exists())) return undefined;
  const headings = [...(await file.text()).matchAll(GROUP_HEADING)].map((match) => match[1] ?? "");
  const order = headings.filter((heading) => groups.includes(heading));
  return order.length > 0 ? order : undefined;
};

const extendVocabulary = (preset: ConfigInput, index: StoreIndex, notes: string[]): ConfigInput => {
  const types = { ...preset.types };
  for (const type of unique(index.documents.map((doc) => doc.type))) {
    if (types[type]) continue;
    types[type] = { ...NEW_TYPE, capabilities: [...NEW_TYPE.capabilities] };
    notes.push(`type ${type} is not in the preset: added with status-line and freshness`);
  }

  const statuses = { ...preset.statuses };
  for (const label of unique(index.documents.map((doc) => doc.meta.status))) {
    if (keyOf(statuses, label) !== undefined) continue;
    statuses[label] = label;
    notes.push(`status "${label}" is not in the preset: added as is`);
  }
  return { ...preset, types, statuses };
};

const withGroupOrders = async (config: ConfigInput, root: string, index: StoreIndex) => {
  const reports = { ...config.reports };
  for (const [name, report] of Object.entries(reports)) {
    const sections = await Promise.all(
      report.sections.map(async (section) => {
        if (!section.groupBy) return section;
        const groups = unique(index.items.map((item) => item.values[section.groupBy ?? ""]));
        const order = await groupOrder(root, report.output, groups);
        return order ? { ...section, groupOrder: order } : section;
      }),
    );
    reports[name] = { ...report, sections };
  }
  return { ...config, reports };
};

/** A preset in the archive's language, widened to every type, status and field it uses. */
export const inferConfig = async (
  root: string,
  language?: Language,
  roots: Readonly<Record<string, string>> = {},
): Promise<Inferred> => {
  const chosen = language ?? (await detectLanguage(root));
  const preset = presetOf(chosen);
  const index = await buildIndex(root, parseConfig(presetConfig(chosen), chosen));
  const notes: string[] = [];
  const fitted = [
    fitFields,
    fitTypeStatuses,
    fitRequired,
    fitStatusLines,
    fitLedger,
    fitIds,
    fitFinished,
    fitStatusLabels,
    fitReports,
  ].reduce((config, fit) => fit(config, index, notes), extendVocabulary(preset, index, notes));
  const config = await withGroupOrders(
    { ...fitted, roots: { ...fitted.roots, ...roots } },
    root,
    index,
  );
  const text = `${HEADER}${Bun.YAML.stringify(config, null, 2)}\n`;
  parseConfig(text, CONFIG_FILE);
  return { language: chosen, text, notes };
};
