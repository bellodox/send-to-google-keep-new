# Send to Google Keep v0.2.12

A minimal reset based on the user's working v0.2.8 Opera GX extension. It fixes duplicate source URLs caused by writing the complete body twice during Keep's link-preview repaint, without redesigning the popup, automatic Close or note capture. No Google OAuth or third-party server is used.

## Install

Extract the Opera extension ZIP. Replace the files in the *existing* unpacked extension directory, then reload the extension in `opera://extensions`. Backup or confirm any unfinished drafts before reload.

## Behavior

The Include Source URL option retains the original v0.2.8 semantics: ON adds one canonical URL to a capture; OFF does not automatically add source text. User-selected URLs remain user content. A reference date is text, not a Keep reminder. Notes are inserted into the currently signed-in Keep web UI with a single reusable compact popup.

## Limitations

Google Keep's DOM is undocumented. This release checks for the actual source hyperlink within the active new-note editor and does *not* write a URL-containing body a second time when rich-link rendering obscures its text. If no convincing evidence appears, it stops safely for manual recovery rather than risking another duplicate. A closed UI is not proof of Google cloud synchronization. See RELEASE_NOTES.md.

## Tests

Run `npm test`; optional Chromium fixtures in `tests/` require Python Playwright and Chromium.
