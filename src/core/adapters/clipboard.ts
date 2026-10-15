import { tmpdir } from "node:os";
import { join } from "node:path";
import { TroveError } from "../errors.ts";

const run = async (command: string[], stdin?: string): Promise<void> => {
  const child = Bun.spawn(command, { stdin: stdin === undefined ? "ignore" : "pipe" });
  if (stdin !== undefined && child.stdin) {
    child.stdin.write(stdin);
    await child.stdin.end();
  }
  if ((await child.exited) !== 0) throw new TroveError(`${command[0]} failed to set the clipboard`);
};

/** clip.exe reads the console code page and mangles Cyrillic, so Windows goes through a UTF-8 file. */
const copyOnWindows = async (text: string): Promise<void> => {
  const file = join(tmpdir(), `trove-clipboard-${process.pid}.txt`);
  await Bun.write(file, text);
  try {
    const script = `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 '${file}')`;
    await run(["powershell", "-NoProfile", "-Command", script]);
  } finally {
    await Bun.file(file).delete();
  }
};

const unixCommand = (): string[] => {
  if (process.platform === "darwin") return ["pbcopy"];
  if (Bun.which("wl-copy")) return ["wl-copy"];
  if (Bun.which("xclip")) return ["xclip", "-selection", "clipboard"];
  throw new TroveError("no clipboard tool: install wl-copy or xclip");
};

export const copyToClipboard = (text: string): Promise<void> =>
  process.platform === "win32" ? copyOnWindows(text) : run(unixCommand(), text);
