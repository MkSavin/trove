---
anchor: WORKAROUND:child-holds-pipe
rule: Stop reading a command's output shortly after it exits, even if the pipe is still open.
---

**Symptom.** `check --verify` never finishes a command that already exited.

**Mechanics.** A background process started by the command inherits its stdout. The pipe stays open while that process lives, so reading to the end waits for it, not for the command.

**Fix.** `collect` races the read against the exit plus a 200 ms grace period, then cancels the reader. Output a child writes later is lost, which is the point.

Not checked automatically: a test needs a child that outlives its parent, and that behaves differently per OS.
