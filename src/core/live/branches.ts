import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "../config/schema.ts";
import { TroveError } from "../errors.ts";
import { git } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { tableLines } from "../reports/section.ts";
import { compareText } from "../text/compare.ts";
import { branchRefs, type LocalLead } from "./branch-refs.ts";

type Args = Readonly<Record<string, string>>;

export type BranchRow = {
  name: string;
  date: string;
  time: number;
  local: LocalLead | undefined;
  /** Commits in none of the bases; missing without bases. */
  own: number | undefined;
  /** Commits not in each base, in the order of the bases. */
  ahead: readonly number[];
};

export type BranchTable = { bases: readonly string[]; rows: readonly BranchRow[] };

const OPTIONS = new Set(["root", "pattern", "against", "merged"]);
const MERGED = ["false", "true", "any"];

const list = (value: string | undefined): string[] => (value ?? "").split(",").filter(Boolean);

export const branchesKey = (args: Args): string =>
  JSON.stringify([args.root, args.pattern, args.against]);

/** The code root a block names; the only one when there is just one. */
export const branchesRoot = (config: Config, args: Args): { name: string; path: string } => {
  const unknown = Object.keys(args).filter((key) => !OPTIONS.has(key));
  if (unknown.length > 0)
    throw new TroveError(
      `trove:branches takes root, pattern, against and merged, not ${unknown.join(", ")}`,
    );
  const names = Object.keys(config.roots);
  const name = args.root ?? (names.length === 1 ? names[0] : undefined);
  const root = name === undefined ? undefined : config.roots[name];
  if (name === undefined || !root) {
    const asked = args.root ? `no root ${args.root}` : "root= names a code root";
    throw new TroveError(`${asked}; known: ${names.join(", ") || "none"}`);
  }
  return { name, path: root.path };
};

const commitOf = async (dir: string, root: string, base: string): Promise<string> => {
  const found = await git(dir, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  if (!found.ok) throw new TroveError(`no ${base} in root ${root}`);
  return found.out;
};

const countCommits = async (dir: string, args: readonly string[]): Promise<number> =>
  Number((await git(dir, ["rev-list", "--count", ...args])).out);

/** Branches of a code root with their lead over each base; nothing when the root is not here. */
export const loadBranches = async (
  index: StoreIndex,
  args: Args,
): Promise<BranchTable | undefined> => {
  const root = branchesRoot(index.config, args);
  const dir = resolve(index.root, root.path);
  if (!existsSync(dir)) return undefined;
  if (!(await git(dir, ["rev-parse", "--git-dir"])).ok)
    throw new TroveError(`root ${root.name} is not a git repository`);
  const bases = list(args.against);
  const commits = await Promise.all(bases.map((base) => commitOf(dir, root.name, base)));
  const refs = await branchRefs(dir, args.pattern ?? "**");
  const rows = await Promise.all(
    refs.map(async ({ ref, name, time, date, local }) => ({
      name,
      time,
      date,
      local,
      own: commits.length > 0 ? await countCommits(dir, [ref, "--not", ...commits]) : undefined,
      ahead: await Promise.all(commits.map((commit) => countCommits(dir, [`${commit}..${ref}`]))),
    })),
  );
  return {
    bases,
    rows: rows.toSorted((a, b) => b.time - a.time || compareText(a.name, b.name)),
  };
};

const escaped = (text: string): string => text.replaceAll("|", "\\|");

const isMerged = (table: BranchTable, row: BranchRow): boolean =>
  table.bases.length > 0 && row.ahead.every((count) => count === 0);

/** `merged=false`, the default, hides branches merged into every base; `true` shows only those. */
const shown = (table: BranchTable, merged: string): BranchRow[] => {
  if (!MERGED.includes(merged)) throw new TroveError(`merged=${merged}: use false, true or any`);
  return table.rows.filter(
    (row) => merged === "any" || isMerged(table, row) === (merged === "true"),
  );
};

const nameCell = (row: BranchRow, config: Config): string => {
  if (!row.local) return row.name;
  const note =
    row.local.behind === 0
      ? `${config.labels.localAhead} ${row.local.ahead}`
      : config.labels.localDiverged;
  return `${row.name} (${note})`;
};

export const renderBranches = (table: BranchTable, config: Config, merged = "false"): string[] => {
  const rows = shown(table, merged);
  const own = table.bases.length > 0 ? [config.labels.ownCommits] : [];
  return rows.length === 0
    ? ["—"]
    : tableLines(
        [config.labels.branch, ...own, ...table.bases, config.labels.lastCommit].map(escaped),
        rows.map((row) => [
          escaped(nameCell(row, config)),
          ...(row.own === undefined ? [] : [String(row.own)]),
          ...row.ahead.map(String),
          row.date,
        ]),
      );
};
