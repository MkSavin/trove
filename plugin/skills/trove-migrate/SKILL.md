---
name: trove-migrate
description: Move an existing hand-kept archive of Markdown audits, plans and specs into a new trove store, without touching the original. Use when the user wants to adopt trove for documents that already exist, or mentions migrating a docs folder or an old checker script.
---

# Migrating an archive into a trove store

The original archive is someone's working folder: only read it. Everything happens in a new folder.

## Steps

1. **Look first.** List the archive's folders, document prefixes and any checker script or generator it uses. Note uncommitted work with `git status`; trove carries it over as its own commit.
2. **Migrate.**

   ```sh
   trove migrate <archive> <new-store> --drop <old-checker> --project <code-repo>
   ```

   `--project` registers the store for the code repository on this machine; add `--link` only when the user agrees to a `.trove.yaml` in that repository. The new store is usually `../<project>-trove`.
3. **Read the report.** Every count must match; `✖` lines mean something was lost, stop and investigate. Notes list types, statuses and fields trove added to the config; decide with the user whether they are real or typos to fix.
4. **Check.** `trove check` in the new store. Errors are real problems in the documents; fix them with trove operations, not by loosening rules. Turn a rule off or set `since:` only when the user decides old documents are exempt.
5. **Point the instructions at trove.** The store's `AGENTS.md` and prompts may describe the old workflow: replace old commands with `trove` ones and old paths with the new folder. Leave archived documents and plans as they are; they are history. Commit with `trove sync`.
6. **Keep up while people still work in the archive.** `trove resync` in the store brings what changed there since the migration, committed or not, three-way; the store's own edits stay. Conflicts wait for `trove resync --continue`. `trove doctor` warns when the archive changed after the last resync.
7. **Seal when the move is done.** Once the user says nobody works in the archive any more, `trove resync --seal` brings the last changes, then writes `MOVED.md` and a first line in the archive's `AGENTS.md` saying where the store is, and commits them there.
8. **Connect.** The store gets no remote at migration; `migrate` prints the archive's one. Give the store its own repository with `trove remote add <url>`; reuse the archive's remote only after sealing, since the push turns that repository into the store for everyone. `trove client add <claude|cursor|codex>` in the code repository for the assistant.
9. **Verify.** `trove doctor` from the code repository shows the store, its health, its sync mode and whether the archive moved on.

## Do not

- Write anything into the original archive, including `git` commands that change its index; `trove resync --seal` is the one exception, and only when the user asks for it.
- Rewrite documents to satisfy new rules in bulk.
- Commit into the store with git directly; use trove.
