# v0.2.12 — Minimal reset from the proven v0.2.8 build

The codebase is reset to the exact shipped v0.2.8 implementation, which the user confirmed could insert and automatically close notes. Only `extension/keep-inject.js` and the manifest version changed.

## Why duplicated URLs happened

Google Keep auto-linkifies source URLs and may replace the body DOM after title input. v0.2.8 incorrectly interpreted that as missing body text and activated the details editor again. This could double the complete body, including the source URL and reference date. Later releases blocked this second write but falsely reported a failed note; the popup manager consequently opened additional windows.

## The minimal repair

- Accept the initial body insertion when Chromium reports success or Keep redraws the active body field; do not fire a duplicate synthetic fallback into populated text.
- After title input, treat a visibly rendered source hyperlink *inside the same new editor bounds* as evidence that Keep retained the body. Wait briefly for asynchronous linkification.
- Never reinsert a URL-containing body when the hyperlink still cannot be verified. Keep the note in recovery instead of producing duplicates.
- Preserve v0.2.8's body-first insertion, Close behavior, reusable popup manager, review UI, permissions, and source URL setting unchanged.

## Important

This is tested in browser DOM fixtures, not in the user's authenticated Opera GX. Automatic Close and cloud sync still require live validation. An ambiguous editor with no verified source link safely stops and may remain for manual recovery. Existing partially inserted notes are not modified.
