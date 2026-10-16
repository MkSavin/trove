import { fillLiveBlocks } from "../../live/fill.ts";
import { isSnapshot } from "../../live/snapshot.ts";
import { emptyWritePlaces } from "../../summaries/write-places.ts";
import { defineRule } from "../rule.ts";

export const liveBlock = defineRule({
  id: "live-block",
  level: "error",
  summary:
    "Generated `<!-- trove:… -->` blocks are closed and name a known view with valid options.",
  scope: "document",
  check: (doc, { index }) =>
    fillLiveBlocks(doc.text, doc.rel, index).problems.map(({ block, message }) => ({
      line: block.open.number,
      message,
    })),
});

export const liveBlockStale = defineRule({
  id: "live-block-stale",
  level: "warn",
  summary:
    "Generated blocks match the store; edits inside them are overwritten by the next report.",
  scope: "document",
  check: (doc, { index }) =>
    isSnapshot(doc, index) || fillLiveBlocks(doc.text, doc.rel, index).text === doc.text
      ? []
      : [{ line: 1, message: "generated blocks are out of date: run trove refresh" }],
});

export const writePlace = defineRule({
  id: "write-place",
  level: "warn",
  summary: "Places a summary leaves for written analysis, `<!-- write: … -->`, are written up.",
  scope: "document",
  check: (doc) =>
    doc.place === "archive"
      ? []
      : emptyWritePlaces(doc.lines.map((line) => line.text)).map((i) => ({
          line: doc.lines[i]?.number ?? i + 1,
          message: "a place left to write is still empty",
        })),
});
