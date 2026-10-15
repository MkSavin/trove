import type { Config, Severity } from "../config/schema.ts";
import type { Document } from "../document/document.ts";
import type { StoreIndex } from "../index/index.ts";

export type Level = Exclude<Severity, "off">;

export type Finding = { message: string; line?: number | undefined; hint?: string | undefined };

export type StoreFinding = Finding & { file: string };

export type RuleContext = { index: StoreIndex; config: Config };

type RuleBase = {
  /** Kebab-case; the key under `rules:` in the store config. */
  id: string;
  level: Level;
  summary: string;
};

/** Runs once per document that has a front matter. */
export type DocumentRule = RuleBase & {
  scope: "document";
  check: (doc: Document, ctx: RuleContext) => readonly Finding[];
};

/** Runs once per store, for checks across documents. */
export type StoreRule = RuleBase & {
  scope: "store";
  check: (ctx: RuleContext) => readonly StoreFinding[];
};

export type Rule = DocumentRule | StoreRule;

export const defineRule = <const R extends Rule>(rule: R): R => rule;
