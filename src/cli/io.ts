export type Io = {
  cwd: string;
  print: (line?: string) => void;
  /** Writes raw text to stdout, no newline added. */
  write: (text: string) => void;
  error: (line: string) => void;
  color: boolean;
  columns: number;
  /** False in CI and pipes: questions take their defaults. */
  interactive: boolean;
  ask: (question: string, fallback: string) => string;
};

const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI;

export const processIo = (): Io => ({
  cwd: process.cwd(),
  print: (line = "") => process.stdout.write(`${line}\n`),
  write: (text) => process.stdout.write(text),
  error: (line) => process.stderr.write(`${line}\n`),
  color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
  columns: process.stdout.columns ?? 120,
  interactive: isInteractive,
  ask: (question, fallback) =>
    isInteractive ? prompt(`${question} [${fallback}]`)?.trim() || fallback : fallback,
});
