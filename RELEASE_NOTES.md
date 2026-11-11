# Send to Google Keep 0.2.8 — Release candidate

This release repairs two failures seen in the authenticated Opera GX screenshots: Keep note text is inserted but Close is not activated, and the same source URL appears twice in the note body.

**Changed:** Close now tries a limited sequence of UI actions and checks the actual disappearance of the active editor. The recovery panel is moved away from Close. Source-attribution normalization removes repeated automatic Source lines, even when joined to a sentence.

**Not changed:** OAuth-free Keep site integration, body-first insertion, popup reuse, draft persistence, account-path checks, or read/write permissions.

**Validated:** 50 Node unit tests and the controlled Chromium Keep editor fixtures, including 2 new Close regressions.

**Not validated:** A full authenticated Opera GX end-to-end test or independent confirmation that Google cloud sync has completed.

**Upgrade:** Replace the contents of your unpacked extension folder and click Reload at `opera://extensions`. Do not retry an already partially entered note. Existing notes and duplicated source lines are not rewritten.
