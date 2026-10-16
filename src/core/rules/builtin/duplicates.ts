import { refText } from "../../index/code-refs.ts";
import { similarItems } from "../../index/similar-items.ts";
import { defineRule } from "../rule.ts";

const DEFAULT_PERCENT = 50;

export const duplicateSuspect = defineRule({
  id: "duplicate-suspect",
  level: "off",
  summary:
    "Open items look like one finding written twice: `limit` percent of their words match (50 by default), or half that when they name overlapping lines of one file.",
  scope: "store",
  check: ({ index, config }) =>
    similarItems(index, config.rules["duplicate-suspect"]?.limit ?? DEFAULT_PERCENT).map(
      ({ first, second, percent, shared }) => ({
        file: second.document,
        line: second.line,
        message: `${second.id} may duplicate ${first.id} in ${first.document}: ${percent}% of words match${shared ? `, both at ${refText(shared)}` : ""}`,
        hint: "merge them, or say in `what` how they differ",
      }),
    ),
});
