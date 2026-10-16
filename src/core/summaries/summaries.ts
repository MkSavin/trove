import type { SummaryConfig } from "../config/schema.ts";
import { TroveError } from "../errors.ts";
import { mergeFilters } from "../index/filters.ts";
import type { StoreIndex } from "../index/index.ts";
import type { Filters } from "../index/query.ts";
import { withGitData } from "../live/git-data.ts";
import { initialStatus } from "../ops/doc-new.ts";
import { placementOf } from "../ops/naming.ts";
import type { Plan } from "../ops/plan.ts";
import { refreshGenerated } from "../reports/embeds.ts";
import { defaultBody, loadBody, renderDraft } from "./template.ts";

export type SummaryRequest = {
  /** A kind from `summaries:` in the config; without it, the built-in layout and no base filter. */
  kind?: string | undefined;
  title?: string | undefined;
  /** Added to the kind's filter. */
  filters?: Filters | undefined;
  /** File name stem after the prefix; `<KIND>_<date>` by default. */
  name?: string | undefined;
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

const draftText = async (index: StoreIndex, request: SummaryRequest): Promise<string> => {
  const kind = kindOf(index, request.kind);
  const body = request.kind
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
  return {
    changes: [{ rel, text }],
    notes: [`created ${rel}: fill the <!-- write: … --> places`],
    message: `docs: add ${stem}`,
  };
};

export const showSummary = async (index: StoreIndex, request: SummaryRequest): Promise<string> => {
  const rel = "SUMMARY.md";
  const draft = await draftText(index, request);
  return refreshGenerated(draft, rel, await withGitData(index, [{ rel, text: draft }]));
};
