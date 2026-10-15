#!/usr/bin/env bun
import { processIo } from "./io.ts";
import { run } from "./run.ts";

// A reader that stops early, like `| head`, is not a failure.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

process.exitCode = await run(Bun.argv.slice(2), processIo());
