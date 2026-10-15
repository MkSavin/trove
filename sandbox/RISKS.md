---
type: risk
status: current
date: 2026-10-01
checked: 2026-10-12
scope: "web/, mobile/"
verify: walk "How to close" of every open risk
---

# RISKS — what may go wrong and is not verified yet

**Status:** current. 1 open risk. Checked 2026-10-12.

Places where the code is shipped but rests on an assumption nobody checked on a real device.

## R1. Service worker update on iOS Safari (open)

The new version activates only after every tab is closed. On iOS, home-screen apps keep a tab alive for days.

**How to close.** Install the app on an iPhone, ship a version, check that the update banner appears within an hour.
