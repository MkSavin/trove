import { join } from "node:path";

export type SourceFile = { path: string; text: string };

export type Repo = {
  agents: SourceFile | undefined;
  docs: readonly SourceFile[];
  code: readonly SourceFile[];
};

export const AGENTS_FILE = "AGENTS.md";
export const DOCS_DIR = ".agents";
export const WORKAROUNDS_DIR = `${DOCS_DIR}/workarounds`;
export const WORKAROUNDS_INDEX = `${DOCS_DIR}/workarounds.md`;

const CODE_DIRS = ["src", "scripts", "test"];
const TYPESCRIPT = new Bun.Glob("**/*.ts");
const MARKDOWN = new Bun.Glob("**/*.md");

/** Sizes and line numbers must not depend on how the working copy was checked out. */
export const normalize = (text: string): string => text.replaceAll("\r\n", "\n");

export const isTestFile = (path: string): boolean => path.startsWith("test/");

const readAll = async (root: string, dir: string, glob: Bun.Glob): Promise<SourceFile[]> => {
  const names = await Array.fromAsync(glob.scan({ cwd: join(root, dir), dot: true }));
  const files = names.map(async (name) => ({
    path: `${dir}/${name.replaceAll("\\", "/")}`,
    text: normalize(await Bun.file(join(root, dir, name)).text()),
  }));
  return (await Promise.all(files)).toSorted((a, b) => a.path.localeCompare(b.path));
};

export const readRepo = async (root: string): Promise<Repo> => {
  const agents = Bun.file(join(root, AGENTS_FILE));
  const code = await Promise.all(CODE_DIRS.map((dir) => readAll(root, dir, TYPESCRIPT)));
  return {
    agents: (await agents.exists())
      ? { path: AGENTS_FILE, text: normalize(await agents.text()) }
      : undefined,
    docs: await readAll(root, DOCS_DIR, MARKDOWN).catch(() => []),
    code: code.flat(),
  };
};
