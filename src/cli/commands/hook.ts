import { afterEdit, atStop, type HookInput, type HookReply } from "../../clients/claude/hooks.ts";
import { TroveError } from "../../core/errors.ts";
import type { Command } from "../command.ts";

const HOOKS: Record<string, (input: HookInput) => Promise<HookReply>> = {
  "post-edit": afterEdit,
  stop: atStop,
};

const readInput = async (): Promise<HookInput> => {
  const raw = await Bun.stdin.text();
  return raw.trim() ? (JSON.parse(raw) as HookInput) : {};
};

export const hook: Command = {
  name: "hook",
  summary: "Claude Code hooks: check an edited document, sync at the end of a session",
  usage: "trove hook <post-edit|stop>  (reads the hook input as JSON on stdin)",
  run: async (argv, io) => {
    const [name] = argv;
    const handler = name ? HOOKS[name] : undefined;
    if (!handler) throw new TroveError(`hook what? ${Object.keys(HOOKS).join(", ")}`);
    const reply = await handler(await readInput());
    if (reply.message) io.error(reply.message);
    return reply.code;
  },
};
