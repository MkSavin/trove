import { afterEdit, atStop, type HookInput, type HookReply } from "../../clients/hooks.ts";
import { TroveError } from "../../core/errors.ts";
import { type Command, EXIT } from "../command.ts";

type Handler = (input: HookInput) => Promise<HookReply>;

const HOOKS: Record<string, Handler> = {
  "post-edit": afterEdit,
  stop: atStop,
};

const readInput = async (): Promise<HookInput> => {
  const raw = await Bun.stdin.text();
  return raw.trim() ? (JSON.parse(raw) as HookInput) : {};
};

/** A crash must not exit 2 like other CLI errors: at Stop that would keep the assistant running forever. */
const replyOf = async (handler: Handler): Promise<readonly [HookInput, HookReply]> => {
  try {
    const input = await readInput();
    return [input, await handler(input)];
  } catch (error) {
    return [{}, { code: EXIT.failed, message: `trove hook failed: ${(error as Error).message}` }];
  }
};

export const hook: Command = {
  name: "hook",
  summary: "Assistant hooks: check an edited document, sync at the end of a session",
  usage: "trove hook <post-edit|stop>  (reads the hook input as JSON on stdin)",
  run: async (argv, io) => {
    const [name] = argv;
    const handler = name ? HOOKS[name] : undefined;
    if (!handler) throw new TroveError(`hook what? ${Object.keys(HOOKS).join(", ")}`);
    const [input, reply] = await replyOf(handler);
    const kimiFeedback =
      name === "post-edit" && input.client_type === "kimi_code_cli" && reply.code === 2;
    if (reply.message) {
      if (kimiFeedback) io.print(reply.message);
      else io.error(reply.message);
    }
    return kimiFeedback ? EXIT.ok : reply.code;
  },
};
