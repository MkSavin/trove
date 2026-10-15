import en from "./en.yaml" with { type: "text" };
import ru from "./ru.yaml" with { type: "text" };

export const LANGUAGES = ["en", "ru"] as const;
export type Language = (typeof LANGUAGES)[number];

const PRESETS: Record<Language, string> = { en, ru };

/** The starting `trove.yaml` text, comments included. */
export const presetConfig = (language: Language): string => PRESETS[language];

export const isLanguage = (value: string): value is Language =>
  LANGUAGES.some((language) => language === value);

export const systemLanguage = (): Language => {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);
  return isLanguage(locale) ? locale : "en";
};
