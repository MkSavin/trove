import { itemHeading } from "../../index/resolve.ts";
import { defineRule } from "../rule.ts";

const DEFAULT_LIMIT = 2048;
const encoder = new TextEncoder();

export const itemSize = defineRule({
  id: "item-size",
  level: "off",
  summary:
    "An item's section, heading to the next one, stays within `limit` bytes (2048 by default).",
  scope: "document",
  check: (doc, { config }) => {
    const limit = config.rules["item-size"]?.limit ?? DEFAULT_LIMIT;
    return (doc.ledger?.items ?? []).flatMap((item) => {
      const heading = itemHeading(doc, item.id);
      if (!heading) return [];
      const size = encoder.encode(doc.text.slice(heading.start, heading.end).trimEnd()).length;
      if (size <= limit) return [];
      return [{ line: heading.line, message: `${item.id} takes ${size} bytes, over ${limit}` }];
    });
  },
});
