import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gitOrThrow } from "../git/git.ts";

const PRE_COMMIT = `#!/bin/sh
# Installed by trove: no commit while the store has errors.
if command -v trove >/dev/null 2>&1; then exec trove check; fi
echo "trove is not on PATH: this commit was not checked" >&2
`;

/** The pre-commit check and the merge driver that `.gitattributes` relies on for reports. */
export const prepareRepository = async (storeRoot: string): Promise<void> => {
  const hooks = resolve(
    storeRoot,
    await gitOrThrow(storeRoot, ["rev-parse", "--git-path", "hooks"]),
  );
  await mkdir(hooks, { recursive: true });
  const hook = join(hooks, "pre-commit");
  await Bun.write(hook, PRE_COMMIT);
  await chmod(hook, 0o755);
  await gitOrThrow(storeRoot, ["config", "merge.ours.driver", "true"]);
};
