import { join } from "node:path";
import { TroveError } from "../../core/errors.ts";
import { realPath } from "../../core/text/real-path.ts";
import { replaceFile } from "../config-files.ts";
import { kimiHome } from "./local.ts";

// Kimi Code refuses the whole config over any key it does not know: only these four.
const HOOKS = [
  { event: "PostToolUse", matcher: "^(Write|Edit)$", command: "trove hook post-edit", timeout: 30 },
  { event: "Stop", command: "trove hook stop", timeout: 120 },
] as const;

export type KimiHooks = { path: string; added: number };

const isPresent = (text: string, command: string): boolean =>
  new RegExp(`^\\s*command\\s*=\\s*["']${command}["']`, "m").test(text);

const asToml = (hook: (typeof HOOKS)[number]): string[] => [
  "[[hooks]]",
  ...Object.entries(hook).map(([key, value]) => `${key} = ${JSON.stringify(value)}`),
];

/** `[[hooks]]` after one of these would make the file invalid TOML. */
const assertAppendable = (text: string, path: string): void => {
  const beforeFirstTable = text.split(/^\s*\[/m)[0] ?? "";
  if (/^\s*hooks\s*=/m.test(beforeFirstTable) || /^\s*\[\s*hooks\s*\]/m.test(text)) {
    throw new TroveError(`${path} defines hooks in another form: add the trove hooks by hand`);
  }
};

const appendix = (text: string, hooks: readonly (typeof HOOKS)[number][]): string => {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = hooks.map((hook) => asToml(hook).join(eol)).join(eol + eol) + eol;
  if (text === "") return body;
  return (text.endsWith("\n") ? eol : eol + eol) + body;
};

/** Appends what is missing and leaves every existing byte alone: the file holds credentials. */
export const addKimiHooks = async (home: string = kimiHome()): Promise<KimiHooks> => {
  const shown = join(home, "config.toml");
  const path = realPath(shown);
  const file = Bun.file(path);
  const existing = (await file.exists()) ? await file.bytes() : new Uint8Array();
  const text = new TextDecoder().decode(existing);
  const missing = HOOKS.filter((hook) => !isPresent(text, hook.command));
  if (missing.length === 0) return { path: shown, added: 0 };
  assertAppendable(text, shown);
  await replaceFile(path, Buffer.concat([existing, Buffer.from(appendix(text, missing))]));
  return { path: shown, added: missing.length };
};
