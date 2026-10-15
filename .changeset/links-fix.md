---
"trove": minor
---

`trove links --fix` keeps dead links into code that git deleted pointing at its last version: a GitHub or GitLab permalink at the parent of the deleting commit, or a `*(deleted in <sha>)*` note that `dead-link` checks at that commit. `trove links --dead` ends with `N dead of M links`.
