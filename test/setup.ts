import { setDefaultTimeout } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A pre-commit hook runs the tests with git's own variables set; they would steer every temp repo.
for (const name of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX"])
  delete process.env[name];

// Keeps local client installs away from the real Claude Code config of this machine.
process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), `trove-test-claude-${process.pid}`);

// bunfig's `timeout` is not applied to every file; git-heavy store tests outrun 5 s under load.
setDefaultTimeout(30_000);
