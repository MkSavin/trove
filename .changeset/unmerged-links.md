---
"trove": patch
---

Archiving a never-committed document commits its new place instead of failing on the old path; a code link missing at the root's ref but present in its checkout is `unmerged`, not dead.
