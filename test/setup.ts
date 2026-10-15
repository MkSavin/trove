// A pre-commit hook runs the tests with git's own variables set; they would steer every temp repo.
for (const name of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX"])
  delete process.env[name];
