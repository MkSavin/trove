import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withHeadingNote } from "../src/core/edit/heading.ts";
import { excerpts } from "../src/core/index/excerpt.ts";
import { selectItems } from "../src/core/index/query.ts";
import { isSnapshot } from "../src/core/live/snapshot.ts";
import { applyPlan } from "../src/core/ops/apply.ts";
import { archivePlan } from "../src/core/ops/doc-archive.ts";
import { newDocument } from "../src/core/ops/doc-new.ts";
import { setDocumentField } from "../src/core/ops/doc-set.ts";
import { requireDocument } from "../src/core/ops/find.ts";
import { addItem } from "../src/core/ops/item-add.ts";
import { closedNote, closeItem } from "../src/core/ops/item-close.ts";
import { deferItem } from "../src/core/ops/item-defer.ts";
import { nameBase } from "../src/core/ops/naming.ts";
import type { Plan } from "../src/core/ops/plan.ts";
import { renderNewDocument } from "../src/core/templates/new-document.ts";
import { openStore, runRules, type Store } from "../src/index.ts";
import { ROOT, TODAY } from "./helpers.ts";

const copies: string[] = [];

const sandbox = async (): Promise<Store> => {
  const root = await mkdtemp(join(tmpdir(), "trove-ops-"));
  copies.push(root);
  await cp(join(ROOT, "sandbox"), root, { recursive: true });
  return openStore({ cwd: root, store: root, today: TODAY });
};

const read = (store: Store, rel: string) => Bun.file(join(store.root, rel)).text();
const reopen = (store: Store) => openStore({ cwd: store.root, store: store.root, today: TODAY });

const apply = async (store: Store, plan: Plan | Promise<Plan>) => {
  const outcome = await applyPlan(store, await plan);
  expect(outcome.introduced).toEqual([]);
  return outcome;
};

afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

describe("closed note", () => {
  test("fills status, date and commit, and drops the commit part without one", () => {
    const values = { status: "closed", date: "2026-10-15", commit: "abc" };
    expect(closedNote("{status}, {commit}", values)).toBe("closed, abc");
    expect(closedNote("{status} {date}, `{commit}`", { ...values, status: "закрыто" })).toBe(
      "закрыто 2026-10-15, `abc`",
    );
    expect(closedNote("{status} {date}, `{commit}`", { ...values, commit: undefined })).toBe(
      "closed 2026-10-15",
    );
  });

  test("replaces only a note trove wrote; a parenthesis of the title stays", async () => {
    const ledger = (await sandbox()).config.ledger;
    if (!ledger) throw new Error("the sandbox has a ledger");
    const close = (title: string) => withHeadingNote(title, "fixed 2026-10-15", ledger);
    expect(close("### X-1. Ollama (local)")).toBe("### X-1. Ollama (local) (fixed 2026-10-15)");
    expect(close("### X-1. Ollama (open)")).toBe("### X-1. Ollama (fixed 2026-10-15)");
    expect(close("### X-1. Ollama (deferred)")).toBe("### X-1. Ollama (fixed 2026-10-15)");
    expect(close("### X-1. Ollama")).toBe("### X-1. Ollama (fixed 2026-10-15)");
    expect(withHeadingNote("### X-1. Ollama (local)", "deferred", ledger)).toBe(
      "### X-1. Ollama (local) (deferred)",
    );
    expect(withHeadingNote("### X-1. Ollama (open)", "deferred", ledger)).toBe(
      "### X-1. Ollama (deferred)",
    );
  });
});

describe("item close", () => {
  test("moves the row and the section into the resolved companion's closed ledger", async () => {
    const store = await sandbox();
    await apply(store, closeItem(store.index, "WEB1-3", { as: "fixed", commit: "a1b2c3d" }));
    const base = await read(store, "audits/AUDIT_WEB_1.md");
    expect(base).not.toContain("| WEB1-3 |");
    expect(base).not.toContain("### WEB1-3.");

    const companion = await read(store, "audits/AUDIT_WEB_1.RESOLVED.md");
    expect(companion).toContain(
      [
        "## Closed items",
        "",
        "<!-- ledger -->",
        "### Web",
        "",
        "| id | P | module | owner | status | what is left |",
        "| -- | - | ------ | ----- | ------ | ------------ |",
        "| WEB1-3 | P2 | threads | web | fixed | Unread counter drifts after a reconnect: deltas are applied twice |",
        "<!-- /ledger -->",
      ].join("\n"),
    );
    expect(companion).toContain(
      `### WEB1-3. Unread counter drifts after a reconnect (fixed ${TODAY}, a1b2c3d)\n\nThe reconnect handler`,
    );

    const next = await reopen(store);
    expect(excerpts(next.index, "WEB1-3")[0]?.file).toBe("audits/AUDIT_WEB_1.RESOLVED.md");
    await expect(closeItem(next.index, "WEB1-3")).rejects.toThrow(/WEB1-3 is already closed/);
    expect(selectItems(next.index, {}).map((item) => item.id)).not.toContain("WEB1-3");
    expect(selectItems(next.index, { state: ["closed"] }).map((item) => item.id)).toEqual([
      "WEB1-3",
    ]);
  });

  test("rebuilds the backlog and names where the item went", async () => {
    const store = await sandbox();
    const outcome = await apply(store, closeItem(store.index, "WEB1-3"));
    expect(outcome.changes.map((change) => change.rel)).toEqual([
      "audits/AUDIT_WEB_1.md",
      "audits/AUDIT_WEB_1.RESOLVED.md",
      "BACKLOG.md",
      "summaries/SUMMARY_WEB.md",
    ]);
    expect(outcome.notes).toEqual(["WEB1-3 → audits/AUDIT_WEB_1.RESOLVED.md"]);
    expect(await read(store, "BACKLOG.md")).not.toContain("| WEB1-3 |");
  });

  test("creates the companion when there is none, linked both ways, and archives it with the audit", async () => {
    const store = await sandbox();
    await apply(store, closeItem(store.index, "MOB1-1", { as: "dropped" }));
    const companion = await read(store, "audits/mobile/AUDIT_MOBILE_1.RESOLVED.md");
    expect(companion).toContain("\nbase: AUDIT_MOBILE_1.md\n");
    expect(companion).toContain(
      `Checked ${TODAY}.\n\n[AUDIT_MOBILE_1](AUDIT_MOBILE_1.md)\n\n## Closed items`,
    );
    expect(companion).toContain("| MOB1-1 |");
    expect(companion).toContain("| dropped |");
    expect(await read(store, "audits/mobile/AUDIT_MOBILE_1.md")).toContain(
      "resolved: AUDIT_MOBILE_1.RESOLVED.md\n",
    );

    const next = await reopen(store);
    const refused = await applyPlan(next, await closeItem(next.index, "MOB1-2"));
    expect(refused.written).toBe(false);
    expect(refused.introduced.map((d) => d.rule)).toEqual(["lifecycle"]);

    await apply(next, closeItem(next.index, "MOB1-2", { archive: true }));
    const archived = (rel: string) => Bun.file(join(store.root, ".archive", rel)).exists();
    expect(await archived("audits/mobile/AUDIT_MOBILE_1.md")).toBe(true);
    expect(await archived("audits/mobile/AUDIT_MOBILE_1.RESOLVED.md")).toBe(true);
    expect(await Bun.file(join(store.root, "audits/mobile/AUDIT_MOBILE_1.md")).exists()).toBe(
      false,
    );
  });

  test("a type without closeInto keeps the section, its heading marked", async () => {
    const store = await sandbox();
    await expect(closeItem(store.index, "DEBT-S1", { as: "fixed" })).rejects.toThrow(
      /no closing outcome fixed; known: closed/,
    );
    await apply(store, closeItem(store.index, "DEBT-S1", { commit: "a1b2c3d" }));
    const text = await read(store, "DEBT.md");
    expect(text).not.toContain("| DEBT-S1 |");
    expect(text).toContain("### DEBT-S1. Presence fan-out per team (done, a1b2c3d)");
  });

  test("keeps CRLF line breaks", async () => {
    const store = await sandbox();
    const rel = "audits/AUDIT_API_2.md";
    await Bun.write(join(store.root, rel), (await read(store, rel)).replaceAll("\n", "\r\n"));
    const crlf = await reopen(store);
    await apply(crlf, closeItem(crlf.index, "API2-3"));
    const text = await read(store, rel);
    expect(text.split("\r\n").length).toBe(text.split("\n").length);
    expect(text).not.toContain("API2-3 | P2");
  });
});

describe("item defer and add", () => {
  test("defer rewrites the status cell and the heading note", async () => {
    const store = await sandbox();
    await apply(store, deferItem(store.index, "WEB1-8"));
    const text = await read(store, "audits/AUDIT_WEB_1.md");
    expect(text).toContain("| WEB1-8 | P3 | a11y | web | deferred |");
    expect(text).toContain("### WEB1-8. Thread list items have no accessible name (deferred)");
  });

  test("add takes the next number, fills the table's columns and appends a section", async () => {
    const store = await sandbox();
    const plan = addItem(store.index, {
      document: "AUDIT_API_2",
      values: { priority: "P1", owner: "api", what: "Session cookies lack SameSite" },
    });
    await apply(store, plan);
    const text = await read(store, "audits/AUDIT_API_2.md");
    expect(text).toContain("| API2-4 | P2 | infra | open | Database backups");
    expect(text).toContain("| API2-5 | P1 | api | open | Session cookies lack SameSite |");
    expect(text.endsWith("## API2-5. Session cookies lack SameSite (open)\n")).toBe(true);
  });

  test("in a ledger of several tables, section picks the table, its id code and its place", async () => {
    const store = await sandbox();
    const plan = addItem(store.index, {
      document: "DEBT",
      values: { section: "Server", what: "Typing indicators batched per thread" },
    });
    expect(plan.notes).toEqual(["added DEBT-S3 to DEBT.md"]);
    await apply(store, plan);
    const text = await read(store, "DEBT.md");
    expect(text).toContain(
      "| DEBT-S3 | open | Typing indicators batched per thread |  |\n<!-- /ledger -->",
    );
    expect(text).toContain(
      "`api/search/` holds no index code.\n\n### DEBT-S3. Typing indicators batched per thread (open)\n\n## Infra",
    );
    expect(() =>
      addItem(store.index, { document: "DEBT", values: { section: "Mobile", what: "x" } }),
    ).toThrow(/no ledger table under Mobile; known: Server, Infra/);
  });

  test("an id outside its section's code is reported", async () => {
    const store = await sandbox();
    const text = (await read(store, "DEBT.md")).replace("| DEBT-I1 |", "| DEBT-S9 |");
    await Bun.write(join(store.root, "DEBT.md"), text);
    const diagnostics = runRules((await reopen(store)).rules, (await reopen(store)).index);
    expect(diagnostics.filter((d) => d.rule === "id-format").map((d) => d.message)).toEqual([
      "DEBT-S9 does not match DEBT-{section}{n}",
    ]);
  });

  test("add never reuses the number of a closed item", async () => {
    const store = await sandbox();
    await apply(store, closeItem(store.index, "WEB1-8"));
    const next = await reopen(store);
    const plan = addItem(next.index, {
      document: "AUDIT_WEB_1",
      values: { priority: "P3", owner: "web", what: "Something new" },
    });
    expect(plan.notes).toEqual(["added WEB1-9 to audits/AUDIT_WEB_1.md"]);
  });

  test("add rejects pipes and missing required columns", async () => {
    const store = await sandbox();
    const values = { priority: "P1", owner: "api", what: "a | b" };
    expect(() => addItem(store.index, { document: "AUDIT_API_2", values })).toThrow(/\|/);
    expect(() => addItem(store.index, { document: "AUDIT_API_2", values: { what: "x" } })).toThrow(
      /missing priority, owner/,
    );
  });
});

describe("doc operations", () => {
  test("new continues the series and derives the slug", async () => {
    const store = await sandbox();
    const plan = await newDocument(store.index, {
      type: "audit",
      topic: "web",
      fields: { scope: "web/" },
    });
    const [change] = plan.changes;
    expect(change?.rel).toBe("audits/AUDIT_WEB_2.md");
    expect(change?.text).toContain("slug: WEB2\nscope: web/\n");
    expect(change?.text).toContain("**Status:** open. Checked 2026-10-15.");
    expect((await applyPlan(store, plan)).introduced).toEqual([]);
  });

  test("new asks for required fields and refuses taken names", async () => {
    const store = await sandbox();
    await expect(newDocument(store.index, { type: "plan", topic: "x" })).rejects.toThrow(
      /needs scope/,
    );
    await expect(
      newDocument(store.index, { type: "plan", topic: "offline mode", fields: { scope: "s" } }),
    ).rejects.toThrow(/PLAN_OFFLINE_MODE.md already exists/);
  });

  test("new transliterates Cyrillic topics and keeps the first words of long ones", () => {
    expect(nameBase("Переезд архива на trove: чего не хватает")).toBe(
      "PEREEZD_ARKHIVA_NA_TROVE_CHEGO_NE_KHVATAET",
    );
    expect(nameBase("Щука, ёж и съезд")).toBe("SHCHUKA_EZH_I_SEZD");
    expect(nameBase("Їжак і ґанок, ўсё")).toBe("YIZHAK_I_GANOK_USE");
    expect(nameBase("one two three four five six seven eight nine")).toBe(
      "ONE_TWO_THREE_FOUR_FIVE_SIX_SEVEN_EIGHT",
    );
    expect(() => nameBase("東京")).toThrow(/--name/);
  });

  test("new fills a custom template, leaving optional fields empty", async () => {
    const store = await sandbox();
    await Bun.write(
      join(store.root, "trove.yaml"),
      `${await read(store, "trove.yaml")}\ntemplates: .trove/templates\n`,
    );
    const template = join(store.root, ".trove", "templates", "prompt.md");
    await Bun.write(
      template,
      '---\ntype: {{type}}\nstatus: {{status}}\ndate: {{date}}\nchecked: {{checked}}\nscope: "{{scope}}"\nmodel: "{{model}}"\n---\n\n# {{name}} — {{title}}\n',
    );
    const next = await reopen(store);
    const input = { type: "prompt", topic: "review", fields: { scope: "web/" } };
    const [change] = (await newDocument(next.index, input)).changes;
    expect(change?.text).toContain('scope: "web/"\nmodel: ""\n');
    expect(change?.text).toContain("# PROMPT_REVIEW — review");

    await Bun.write(template, "# {{name}} by {{reviewer}} and {{team}}\n");
    await expect(newDocument(next.index, input)).rejects.toThrow(
      "the prompt template uses {{reviewer}}, {{team}}, not a field of prompt",
    );
  });

  test("archive moves the file, rebases its links and retargets links to it", async () => {
    const store = await sandbox();
    await apply(store, archivePlan(store.index, requireDocument(store.index, "PLAN_PUSH_RETRY")));
    const moved = await read(store, ".archive/plans/PLAN_PUSH_RETRY.md");
    expect(moved).toContain("status: archived");
    expect(moved).toContain("**Status:** archived.");
    expect(await read(store, "DEBT.md")).toContain("(.archive/plans/PLAN_PUSH_RETRY.md)");

    const next = await reopen(store);
    expect(runRules(next.rules, next.index).filter((d) => d.severity === "error")).toEqual([]);
  });

  test("archive rebases links that leave the store", async () => {
    const store = await sandbox();
    const doc = requireDocument(store.index, "AUDIT_WEB_1");
    const [moved] = archivePlan(store.index, doc).changes;
    expect(moved?.text).toContain("(../../../harbor/web/src/composer/send.ts#L41-L63)");
    expect(moved?.text).toContain("(../../plans/PLAN_OFFLINE_MODE.md)");
  });

  test("set status writes the label in the header and the status line", async () => {
    const store = await sandbox();
    await apply(store, setDocumentField(store.index, "PLAN_OFFLINE_MODE", "status", "in-progress"));
    const text = await read(store, "plans/PLAN_OFFLINE_MODE.md");
    expect(text).toContain("status: in progress\n");
    expect(text).toContain("**Status:** in progress. Waits for");
    expect(() => setDocumentField(store.index, "PLAN_OFFLINE_MODE", "status", "done")).toThrow(
      /unknown status/,
    );
  });

  test("dry run writes nothing", async () => {
    const store = await sandbox();
    const before = await read(store, "RISKS.md");
    const outcome = await applyPlan(
      store,
      setDocumentField(store.index, "RISKS", "checked", "2026-10-15"),
      {
        dryRun: true,
      },
    );
    expect(outcome.written).toBe(false);
    expect(outcome.changes[0]?.previous).toBe(before);
    expect(await read(store, "RISKS.md")).toBe(before);
  });
});

describe("sections, headers and lookups", () => {
  test("ledger.heading and ledger.stub shape a new item's section, which then defers", async () => {
    const store = await sandbox();
    const config = await read(store, "trove.yaml");
    await Bun.write(
      join(store.root, "trove.yaml"),
      config.replace(
        /^ {2}note: .*$/m,
        '$&\n  heading: "{id}. {what}"\n  stub: "**Owner.** {owner}\\n\\n**Fix.**"',
      ),
    );
    const shaped = await reopen(store);
    await apply(
      shaped,
      addItem(shaped.index, {
        document: "AUDIT_API_2",
        values: { priority: "P1", owner: "api", what: "Session cookies lack SameSite" },
      }),
    );
    const added = await read(store, "audits/AUDIT_API_2.md");
    expect(
      added.endsWith("## API2-5. Session cookies lack SameSite\n\n**Owner.** api\n\n**Fix.**\n"),
    ).toBe(true);
    const next = await reopen(store);
    await apply(next, deferItem(next.index, "API2-5"));
    expect(await read(store, "audits/AUDIT_API_2.md")).toContain(
      "## API2-5. Session cookies lack SameSite (deferred)\n",
    );
  });

  test("double-quoted header values escape backslashes and quotes", async () => {
    const store = await sandbox();
    const value = 'trove: D:\\Dev\\trove "x"';
    await apply(store, setDocumentField(store.index, "RISKS", "scope", value));
    const text = await read(store, "RISKS.md");
    expect(text).toContain('scope: "trove: D:\\\\Dev\\\\trove \\"x\\""\n');
    expect(requireDocument((await reopen(store)).index, "RISKS").meta.scope).toBe(value);
    const header = text.split("---\n")[1] ?? "";
    expect((Bun.YAML.parse(header) as { scope: string }).scope).toBe(value);
  });

  test("show finds every section titled by an id no ledger holds", async () => {
    const store = await sandbox();
    const rel = "audits/AUDIT_WEB_1.RESOLVED.md";
    await Bun.write(
      join(store.root, rel),
      `${await read(store, rel)}\n### WEB1-99. Old fix (fixed)\n\nIt was fixed.\n`,
    );
    const archived = ".archive/audits/AUDIT_WEB_0.md";
    await Bun.write(
      join(store.root, archived),
      "---\ntype: research\nstatus: archived\ndate: 2026-01-01\nchecked: 2026-01-01\nscope: x\n---\n\n# Old\n\n## `WEB1-99` — still noted\n\nText.\n",
    );
    const found = excerpts((await reopen(store)).index, "WEB1-99");
    expect(found.map((excerpt) => excerpt.file)).toEqual([archived, rel]);
    expect(found[1]?.text).toBe("### WEB1-99. Old fix (fixed)\n\nIt was fixed.");
    expect(() => excerpts(store.index, "WEB1-98")).toThrow(/nothing matches WEB1-98/);
  });

  test("a new document carries a status line only when its type has the capability", async () => {
    const store = await sandbox();
    const plan = store.config.types.plan;
    if (!plan) throw new Error("the sandbox has plans");
    const input = {
      type: "plan",
      name: "PLAN_X",
      title: "x",
      status: "open",
      date: TODAY,
      fields: [],
    };
    expect(renderNewDocument(store.config, input)).toContain("**Status:** open.");
    const bare = {
      ...store.config,
      types: { ...store.config.types, plan: { ...plan, capabilities: [] } },
    };
    expect(renderNewDocument(bare, input)).not.toContain("**Status:**");
  });

  test("id-format names a header field the ids need and the document lacks", async () => {
    const store = await sandbox();
    const rel = "audits/AUDIT_API_2.md";
    await Bun.write(join(store.root, rel), (await read(store, rel)).replace("slug: API2\n", ""));
    const next = await reopen(store);
    const messages = runRules(next.rules, next.index)
      .filter((d) => d.rule === "id-format")
      .map((d) => d.message);
    expect(messages).toEqual([`ids follow {slug}-{n}, but ${rel} has no slug`]);
  });

  test("item-size, once turned on, reports sections over the limit", async () => {
    const store = await sandbox();
    const quiet = runRules(store.rules, store.index).filter((d) => d.rule === "item-size");
    expect(quiet).toEqual([]);
    const config = await read(store, "trove.yaml");
    await Bun.write(
      join(store.root, "trove.yaml"),
      `${config}\nrules:\n  item-size: { level: warn, limit: 300 }\n`.replace(
        /\nrules: \{\}\r?\n/,
        "\n",
      ),
    );
    const sized = await reopen(store);
    const found = runRules(sized.rules, sized.index).filter((d) => d.rule === "item-size");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.severity).toBe("warn");
    expect(found[0]?.message).toMatch(/takes \d+ bytes, over 300/);
  });

  test("a summary keeps its blocks as a snapshot once its date has passed", async () => {
    const later = await openStore({ cwd: ROOT, store: join(ROOT, "sandbox"), today: "2099-01-01" });
    const summary = requireDocument(later.index, "SUMMARY_WEB");
    expect(isSnapshot(summary, later.index)).toBe(true);
    const same = await openStore({ cwd: ROOT, store: join(ROOT, "sandbox"), today: TODAY });
    expect(isSnapshot(requireDocument(same.index, "SUMMARY_WEB"), same.index)).toBe(false);
    expect(isSnapshot(requireDocument(later.index, "AUDIT_WEB_1"), later.index)).toBe(false);
  });
});
