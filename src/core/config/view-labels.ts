import { isLanguage, type Language, presetConfig } from "../presets/presets.ts";

/** Labels that only generated blocks show, so a store gets new ones in its language. */
const VIEW_LABELS = [
  "branch",
  "lastCommit",
  "ownCommits",
  "localAhead",
  "localDiverged",
  "change",
  "changeClosed",
  "changeAdded",
  "changeMoved",
];

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const presetLabels = new Map<Language, Raw>();

const viewLabelsOf = (language: Language): Raw => {
  const cached = presetLabels.get(language);
  if (cached) return cached;
  const preset: unknown = Bun.YAML.parse(presetConfig(language));
  const labels = isRaw(preset) && isRaw(preset.labels) ? preset.labels : {};
  const picked = Object.fromEntries(
    Object.entries(labels).filter(([key]) => VIEW_LABELS.includes(key)),
  );
  presetLabels.set(language, picked);
  return picked;
};

/** The raw config with view labels it leaves out taken from its language's preset. */
export const withViewLabels = (raw: unknown): unknown => {
  if (!isRaw(raw) || typeof raw.language !== "string" || !isLanguage(raw.language)) return raw;
  const own = raw.labels ?? {};
  if (!isRaw(own)) return raw;
  return { ...raw, labels: { ...viewLabelsOf(raw.language), ...own } };
};
