# Changesets

Every user-facing change ships with a note here: `bun changeset` asks for the bump and a summary.
On `main`, CI turns pending notes into a "Version Packages" PR; merging it bumps `package.json`,
writes `CHANGELOG.md` and tags the release.
