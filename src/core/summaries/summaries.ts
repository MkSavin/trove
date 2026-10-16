import { posix } from "node:path";
import type { SummaryConfig } from "../config/schema.ts";
import { fieldSpecs } from "../config/vocabulary.ts";
import type { Document } from "../document/document.ts";
import { setField } from "../edit/front-matter.ts";
import { applyPatches } from "../edit/patch.ts";
import { TroveError } from "../errors.ts";
import { mergeFilters } from "../index/filters.ts";
import type { StoreIndex } from "../index/index.ts";
import type { Filters } from "../index/query.ts";
import { findDocument } from "../index/resolve.ts";
import { withGitData } from "../live/git-data.ts";
import { archivePlan } from "../ops/doc-archive.ts";
import { initialStatus } from "../ops/doc-new.ts";
import { placementOf } from "../ops/naming.ts";
import type { Plan } from "../ops/plan.ts";
import { thenPlan } from "../ops/with-changes.ts";
import { refreshGenerated } from "../reports/embeds.ts";
import { compareText } from "../text/compare.ts";
import { defaultBody, loadBody, renderDraft } from "./template.ts";

const LATEST = "latest";
const SUCCESSOR = "superseded_by";
const LEADING_BREAKS = /^(?:\r?\n)+/;

export type SummaryRequest = {
  /** A kind from `summaries:` in the config; without it, the built-in layout and no base filter. */
  kind?: string | undefined;
  title?: string | undefined;
  /** Added to the kind's filter. */
  filters?: Filters | undefined;
  /** File name stem after the prefix; `<KIND>_<date>` by default. */
  name?: string | undefined;
  /** `latest` or a document name: its written text carries over, the blocks are refilled. */
  from?: string | undefined;
  /** Leaves earlier summaries of the kind in work instead of archiving them. */
  keep?: boolean | undefined;
};

const ADHOC: SummaryConfig = { title: "Summary", type: "summary", scope: undefined, filter: {} };

const kindOf = (index: StoreIndex, kind: string | undefined): SummaryConfig => {
  if (kind === undefined) return ADHOC;
  const found = index.config.summaries[kind];
  if (!found) {
    const known = Object.keys(index.config.summaries).join(", ") || "none";
    throw new TroveError(`no summary kind ${kind}; known: ${known}`);
  }
  return found;
};

/** Summaries of the kind, newest first. */
const earlier = (index: StoreIndex, request: SummaryRequest): Document[] => {
  if (!request.kind) return [];
  const kind = kindOf(index, request.kind);
  return index.documents
    .filter((doc) => doc.type === kind.type && doc.meta.kind === request.kind)
    .toSorted(
      (a, b) => compareText(b.meta.date ?? "", a.meta.date ?? "") || compareText(b.name, a.name),
    );
};

const source = (index: StoreIndex, request: SummaryRequest): Document | undefined => {
  if (request.from === undefined) return undefined;
  const found =
    request.from === LATEST ? earlier(index, request)[0] : findDocument(index, request.from);
  if (!found) throw new TroveError(`no summary to start from: ${request.from}`);
  return found;
};

/** What follows the status line, or the title when there is none: the written part. */
const writtenBody = (doc: Document): string => {
  const after =
    doc.statusLine?.line ?? doc.lines[(doc.headings.find((h) => h.level === 1)?.line ?? 1) - 1];
  return after ? doc.text.slice(after.end).replace(LEADING_BREAKS, "") : doc.text;
};

const draftText = async (index: StoreIndex, request: SummaryRequest): Promise<string> => {
  const kind = kindOf(index, request.kind);
  const from = source(index, request);
  const body = from
    ? writtenBody(from)
    : request.kind
      ? await loadBody(index.root, index.config, kind)
      : defaultBody(index.config);
  const title = request.title ?? kind.title;
  return renderDraft(index.config, {
    kind: request.kind ?? "adhoc",
    title,
    status: index.config.types[kind.type] ? initialStatus(index, kind.type) : "current",
    date: index.today,
    scope: kind.scope ?? title,
    filter: mergeFilters(kind.filter, request.filters ?? {}),
    body,
  });
};

const stemFor = (index: StoreIndex, request: SummaryRequest, prefix: string): string =>
  prefix +
  (request.name ??
    `${(request.kind ?? "summary").toUpperCase().replace(/\W+/g, "_")}_${index.today}`);

/** The earlier summaries of the kind still in work go to the archive, each naming its successor. */
const supersede = (index: StoreIndex, plan: Plan, rel: string, request: SummaryRequest): Plan => {
  const replaced = request.keep
    ? []
    : earlier(index, request).filter((doc) => doc.place === "work");
  const name = posix.basename(rel);
  return replaced.reduce(
    (current, old) =>
      thenPlan(index, current, (after) => {
        const doc = after.byRel.get(old.rel);
        if (!doc) throw new TroveError(`${old.rel} is gone`);
        const named = Object.hasOwn(fieldSpecs(index.config, doc.typeConfig), SUCCESSOR)
          ? { rel: doc.rel, text: applyPatches(doc.text, [setField(doc, SUCCESSOR, name)]) }
          : undefined;
        return named
          ? thenPlan(after, { changes: [named], notes: [], message: "" }, (renamed) =>
              archivePlan(renamed, renamed.byRel.get(doc.rel) ?? doc),
            )
          : archivePlan(after, doc);
      }),
    plan,
  );
};

/** A new summary document: the kind's template with every generated block already filled. */
export const newSummary = async (index: StoreIndex, request: SummaryRequest): Promise<Plan> => {
  const kind = kindOf(index, request.kind);
  if (!index.config.types[kind.type]) throw new TroveError(`summaries need a ${kind.type} type`);
  const { folder, prefix } = placementOf(index.config, kind.type);
  const stem = stemFor(index, request, prefix);
  if (index.byName.has(`${stem}.md`))
    throw new TroveError(`${stem}.md already exists: pass a name`);
  const rel = folder ? `${folder}/${stem}.md` : `${stem}.md`;
  const draft = await draftText(index, request);
  const text = refreshGenerated(draft, rel, await withGitData(index, [{ rel, text: draft }]));
  const plan = supersede(
    index,
    {
      changes: [{ rel, text }],
      notes: [`created ${rel}: fill the <!-- write: … --> places`],
      message: `docs: add ${stem}`,
    },
    rel,
    request,
  );
  return { ...plan, message: `docs: add ${stem}` };
};

export const showSummary = async (index: StoreIndex, request: SummaryRequest): Promise<string> => {
  const rel = "SUMMARY.md";
  const draft = await draftText(index, request);
  return refreshGenerated(draft, rel, await withGitData(index, [{ rel, text: draft }]));
};
