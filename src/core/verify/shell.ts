import { gitEnv } from "../git/git.ts";

export type ShellResult = { code: number; timedOut: boolean; output: string; ms: number };

export type ShellOptions = { cwd: string; timeoutMs: number };

/** A child the command left behind may hold the pipe open: output is read only this long after exit. */
const DRAIN_GRACE_MS = 200;

const collect = async (
  stream: ReadableStream<Uint8Array>,
  exited: Promise<number>,
): Promise<string> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  const drained = (async () => {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      chunks.push(read.value);
    }
  })().catch(() => undefined);
  await Promise.race([drained, exited.then(() => Bun.sleep(DRAIN_GRACE_MS))]);
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString("utf8");
};

/** Runs through Bun's own shell, the same on every OS; a compiled trove acts as `bun` under `BUN_BE_BUN`. */
export const runShell = async (
  command: string,
  { cwd, timeoutMs }: ShellOptions,
): Promise<ShellResult> => {
  const started = performance.now();
  const child = Bun.spawn([process.execPath, "exec", command], {
    cwd,
    env: { ...gitEnv(), BUN_BE_BUN: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  const [code, stdout, stderr] = await Promise.all([
    child.exited.finally(() => clearTimeout(timer)),
    collect(child.stdout, child.exited),
    collect(child.stderr, child.exited),
  ]);
  return {
    code,
    timedOut,
    output: `${stdout}${stderr}`.trim(),
    ms: performance.now() - started,
  };
};
