import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { TroveError } from "../../core/errors.ts";
import { writeReports } from "../../core/reports/write.ts";
import { hasErrors } from "../../core/rules/diagnostic.ts";
import { runRules } from "../../core/rules/run.ts";
import { syncStore } from "../../core/sync/sync.ts";
import { type Context, openFor, storeField } from "../context.ts";
import { guarded, json } from "../respond.ts";

const MAINTAIN = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;

export const registerMaintenanceTools = (server: McpServer, context: Context): void => {
  server.registerTool(
    "trove_report",
    {
      description:
        "Rebuild generated documents such as the backlog; edits made through trove tools already do this.",
      inputSchema: z.object({ store: storeField, names: z.array(z.string()).optional() }),
      annotations: { ...MAINTAIN, openWorldHint: false },
    },
    guarded(async ({ store, names }) => {
      const opened = await openFor(context, store);
      if (hasErrors(runRules(opened.rules, opened.index))) {
        throw new TroveError("check is red: fix the errors first (trove_check)");
      }
      const known = Object.keys(opened.config.reports);
      return json(await writeReports(opened.index, names ?? known));
    }),
  );

  server.registerTool(
    "trove_sync",
    {
      description:
        "Commit hand edits together with rebuilt reports and push, by the store's sync mode. Refuses while check is red.",
      inputSchema: z.object({ store: storeField, message: z.string().optional() }),
      annotations: MAINTAIN,
    },
    guarded(async ({ store, message }) =>
      json(await syncStore(await openFor(context, store), message)),
    ),
  );
};
