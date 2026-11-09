---
anchor: WORKAROUND:clip-exe-codepage
rule: On Windows, copy through a UTF-8 file and PowerShell, never clip.exe.
---

**Symptom.** `trove prompt --copy` pastes Cyrillic text as garbage on Windows.

**Mechanics.** `clip.exe` decodes its input with the console code page, not UTF-8.

**Fix.** `copyOnWindows` writes the text to a temporary UTF-8 file and runs `Set-Clipboard` over `Get-Content -Encoding UTF8`.

Not checked automatically: no CI runner has a clipboard.
