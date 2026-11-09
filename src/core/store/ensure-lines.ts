import { appendFile } from "node:fs/promises";

const readOrEmpty = async (file: string): Promise<string> => {
  const handle = Bun.file(file);
  return (await handle.exists()) ? handle.text() : "";
};

const absentFrom = (text: string, lines: readonly string[]): string[] => {
  const present = text.split(/\r?\n/);
  return lines.filter((line) => !present.includes(line));
};

export const missingLines = async (file: string, lines: readonly string[]): Promise<string[]> =>
  absentFrom(await readOrEmpty(file), lines);

/** Appends the lines the file lacks; true when it changed. */
export const ensureLines = async (file: string, lines: readonly string[]): Promise<boolean> => {
  const text = await readOrEmpty(file);
  const missing = absentFrom(text, lines);
  if (missing.length === 0) return false;
  const gap = text === "" || text.endsWith("\n") ? "" : "\n";
  await appendFile(file, `${gap}${missing.join("\n")}\n`);
  return true;
};
