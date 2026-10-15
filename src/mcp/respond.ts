import { TroveError } from "../core/errors.ts";

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] });

export const json = (value: unknown): ToolResult => text(JSON.stringify(value, null, 1));

/** User-fixable failures come back as tool errors the model can read and act on. */
export const guarded =
  <Args>(handler: (args: Args) => Promise<ToolResult>) =>
  async (args: Args): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (error) {
      if (!(error instanceof TroveError)) throw error;
      return { ...text(error.message), isError: true };
    }
  };
