import { gitEnv } from "../git/git.ts";

export type ShellResult = { code: number; timedOut: boolean; output: string; ms: number };

export type ShellOptions = { cwd: string; timeoutMs: number };

// @anchor WORKAROUND:child-holds-pipe A child the command left behind may hold the pipe open past its exit.
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

/** Runs through Bun's own shell, the same on every OS. */
export const runShell = async (
  command: string,
  { cwd, timeoutMs }: ShellOptions,
): Promise<ShellResult> => {
  const started = performance.now();
  const child = Bun.spawn([process.execPath, "exec", command], {
    cwd,
    // @anchor WORKAROUND:compiled-bun-be-bun A compiled trove's execPath is trove itself, not bun.
    env: { ...gitEnv(), BUN_BE_BUN: "1" },
    // @anchor WORKAROUND:child-stdin-closed A command must not read the MCP server's protocol stream.
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
