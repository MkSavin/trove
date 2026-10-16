import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "../config/schema.ts";
import { TroveError } from "../errors.ts";
import { git } from "../git/git.ts";
import type { StoreIndex } from "../index/index.ts";
import { tableLines } from "../reports/section.ts";
import { compareText } from "../text/compare.ts";

type Args = Readonly<Record<string, string>>;

export type BranchRow = {
  name: string;
  date: string;
  time: number;
  /** Commits not in each base, in the order of the bases. */
  ahead: readonly number[];
};

export type BranchTable = { bases: readonly string[]; rows: readonly BranchRow[] };

const OPTIONS = new Set(["root", "pattern", "against"]);
const REF_FORMAT = [
  "%(refname)",
  "%(refname:short)",
  "%(symref)",
  "%(committerdate:unix)",
  "%(committerdate:short)",
].join("%00");
const REMOTE = /^refs\/remotes\/[^/]+\//;
const LOCAL = /^refs\/heads\//;

const list = (value: string | undefined): string[] => (value ?? "").split(",").filter(Boolean);

export const branchesKey = (args: Args): string =>
  JSON.stringify([args.root, args.pattern, args.against]);

/** The code root a block names; the only one when there is just one. */
export const branchesRoot = (config: Config, args: Args): { name: string; path: string } => {
  const unknown = Object.keys(args).filter((key) => !OPTIONS.has(key));
  if (unknown.length > 0)
    throw new TroveError(
      `trove:branches takes root, pattern and against, not ${unknown.join(", ")}`,
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

type Ref = { ref: string; name: string; time: number; date: string };

const matchingRefs = async (dir: string, pattern: string): Promise<Ref[]> => {
  const listed = await git(dir, [
    "for-each-ref",
    `--format=${REF_FORMAT}`,
    "refs/heads",
    "refs/remotes",
  ]);
  const glob = new Bun.Glob(pattern);
  return listed.out
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [ref = "", name = "", symref = "", time = "0", date = ""] = line.split("\0");
      const branch = ref.replace(LOCAL, "").replace(REMOTE, "");
      return symref || !glob.match(branch) ? [] : [{ ref, name, time: Number(time), date }];
    });
};

const aheadOf = async (dir: string, ref: string, base: string): Promise<number> =>
  Number((await git(dir, ["rev-list", "--count", `${base}..${ref}`])).out);

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
  const refs = await matchingRefs(dir, args.pattern ?? "**");
  const rows = await Promise.all(
    refs.map(async ({ ref, name, time, date }) => ({
      name,
      time,
      date,
      ahead: await Promise.all(commits.map((commit) => aheadOf(dir, ref, commit))),
    })),
  );
  return {
    bases,
    rows: rows.toSorted((a, b) => b.time - a.time || compareText(a.name, b.name)),
  };
};

const escaped = (text: string): string => text.replaceAll("|", "\\|");

export const renderBranches = (table: BranchTable, config: Config): string[] =>
  table.rows.length === 0
    ? ["—"]
    : tableLines(
        [config.labels.branch, ...table.bases, config.labels.lastCommit].map(escaped),
        table.rows.map((row) => [escaped(row.name), ...row.ahead.map(String), row.date]),
      );
