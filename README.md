# Send to Google Keep — v0.2.8

This is an **unofficial Opera/Chromium extension** rebuilt from the previous v0.1.8 experiment in response to real Opera GX failures. It is **not** a Google product, does not use the private Keep API, and has **not yet passed a live authenticated Opera test**.

## What changed

The v0.1.x implementation mixed a global active draft, a capture queue, and an automatic Keep window job. If one Keep editor could not be identified, every subsequent capture was blocked. A no-review capture could also open a tab without performing insertion when site permission was missing.

The current release keeps independent capture records, but uses **one reusable Google Keep popup window** instead of stacking a new popup for every capture. Captures are inserted serially into fresh Keep composers. A short scheduling handoff is not a user-managed queue: the next ready note begins automatically after the previous attempt finishes, and an error on one note does not prevent later notes. The extension does not blindly retry uncertain writes.

## Normal operation

1. Open `opera://extensions`, enable Developer mode, and use **Load unpacked** on the `extension` directory. Keep only one installed copy.
2. Open the extension **Options** and click **Allow Google Keep access** once. It grants access ONLY to `https://keep.google.com/*`. This is necessary for direct, no-review insertion. The grant persists until you revoke it in Opera's extension permissions.
3. With **Review every note before sending** OFF (default), right-click a page/link/selection or click the extension icon. Keep opens in a compact popup (or **reuses the existing popup**), attempts to create a note, fills title and body, and clicks Keep's native Close control when safely identified. The next capture reloads that same popup to start a clean composer.
4. With **Review every note before sending** ON, a separate editor opens first. Modify title, reference date, and details; click **Send to Google Keep**. The same reusable Keep popup is used afterward. If a previous insertion is still in flight, the next note waits briefly and then starts automatically.
5. Capture another page immediately. Neither a previous success nor a previous failure blocks it. No Options cleanup is required.

If Keep site access has not been granted, even with review OFF, **the editor opens once to request the permission**. The extension does not silently open Keep with no insertion. If access is declined, the editor offers manual copying and an **Open Keep for manual entry** option.

## Recovery

Drafts and transaction states are retained in `chrome.storage.local` across browser restarts and extension reloads; unfinished records are not automatically discarded. Up to 200 unresolved captures are supported, after which the extension returns an explicit capacity error instead of silently deleting a draft. Completed history is limited to 80 entries and 30 days. Options displays status for each record, including errors and manual copy controls. Automatic insertion is attempted **once** for each capture. A missing/ambiguous composer, an interrupted extension service worker, a timeout, or a partially filled note is marked `needs-attention`. If a failed insertion may have partially modified Keep, the existing popup is preserved for recovery rather than navigating away from potentially unsaved content. In that exceptional case a later capture may need a second popup; this prevents data loss. In-page Keep recovery controls may also appear. **Do not submit an uncertain note again automatically**: check whether Keep already contains it, then copy manually if needed.

The extension preserves source privacy by stripping URL query strings and fragments by default. Dates are saved as **reference text**, not native Keep reminders. No developer-hosted backend, third-party analytics, OAuth access tokens, passwords, or Google Tasks scopes are used.

## Known limits

- Keep for personal Google accounts does not offer an equivalent supported public API for the existing Google Tasks extension. This build interacts with Keep's authenticated web editor, whose internal DOM can change.
- The extension now requires an observable editor-close transition after inserting and checking title/details. A Close click alone is **not** accepted. The extension **cannot independently verify successful Google cloud synchronization**.
- A compact popup removes browser bars but is not truly frameless (the operating system controls the window border).
- Browser fixtures and mocked extension tests are not equivalent to the user's real Opera GX session. **Test on a disposable Google account first.**
- Replacing an unpacked extension in the same folder normally retains its ID and settings. Installing from a different folder may change the ID and require permissions again.

## Testing

Run `npm test` at project root. Browser DOM tests (simulated Keep) can be run with:

```
python3 tests/chromium-fixture.py
python3 tests/opera-popup-fixture.py
```

Also run `python3 tests/opera-visual-activation.py` for the popup-sized CSS-placeholder editor. See `TEST_REPORT.md` for test scope and unverified items.

## License

MIT for the extension source. The code is an independent experiment, not an official Google Keep add-on.

## v0.2.3 Opera editor compatibility

The insertion routine now resolves Keep's composer, title, body and Close control in stages. It reacquires the current body after writing the title; it searches for a unique Close action in the editor footer (including plain `div` controls). These changes were tested with simulated DOM layouts derived from Opera GX screenshots and privacy-safe diagnostics, **not** against authenticated Google Keep. See `RELEASE_NOTES.md`.

## v0.2.3 — Opera GX diagnostic fix

The previous release could not detect the collapsed Google Keep composer even when Opera displayed a `DIV[role="combobox"]` in the expected location. The page draws the placeholder text through CSS, so looking for `Take a note…` in `innerText`, `aria-label`, or an editable input is unreliable.

The insertion engine now recognizes a **unique, wide combobox within the top-of-notes composer band** (based on the anonymized layout diagnostics), without treating header search or saved notes as candidates. It clicks the visual input area once; title, body, and Close logic remain unchanged from v0.2.2. The single reusable popup and independent capture records are retained.

The new test `tests/opera-diagnostic-20261110.py` reproduces the reported 920x639 viewport, x=295 y=97 w=598 h=42 combobox, hidden second combobox, existing notes with editable fields, CSS-only placeholder, lazy title/body inputs and dynamic body replacement. It verifies one composer activation, one title insertion, one body insertion and one Close action without modifying saved notes.

**Validation limitation:** This is a fix based on the real reported geometry but a simulated DOM. We cannot access the authenticated Google Keep DOM inside the user's Opera GX browser from here. The first live test is required to confirm compatibility. If it fails, do not retry on a partially filled note until its state has been checked.

## v0.2.5 — Title/body editor lifecycle fix

In earlier builds, Google Keep sometimes replaced the body editor after the extension typed the title. Version 0.2.5 **inserts details first, then title**. It verifies the body still exists after the title entry and refuses to duplicate any body text already present. The one-popup workflow, permissions, and credential handling remain unchanged. Live Opera GX and cloud persistence still require verification.

If a partial insertion still fails in Opera, **do not retry a full insertion**. The yellow assistant in Keep now provides **Copy remaining details** and **Copy diagnostics** for such cases. Complete the current note manually, or use Options recovery. See `RELEASE_NOTES.md` and `TEST_REPORT.md` for details and testing limitations.


## Reliability repair (0.2.6)

- Unfinished capture records persist in `chrome.storage.local` across Opera restart, update, and extension reload. The popup reference also persists but is validated before reuse. Use **Options → Clear completed history** or per-record **Remove** to clear retained content. Never store captured secrets without considering local disk exposure.
- The insertion attempt has a unique ID and is serialized; duplicate page-load events cannot start parallel writes. A late successful result can reconcile a previously timed-out attempt; unknown writes are never retried automatically.
- After clicking the native Keep Close, the extension waits for the close control or the editor to disappear, then allows an additional settling interval before reusing the popup. This is only a **UI acknowledgement**, never proof of cloud synchronization.
- A changed `/u/N/` Keep account path is blocked on popup reuse. This path is not a stable identity; always verify the avatar/account yourself.
- URL cleanup preserves recognized functional parameters (including YouTube `v` and Google search `q`) and removes unrecognized tracking/query parameters. Long selections reserve space for source attribution.
- Existing note cards are guarded by a unique activated composer and a location check. Keep's unversioned DOM can still change; a failed selector must stop without an arbitrary write.
- The body/text writer still uses a deprecated browser API as a compatibility fallback. The user must confirm live Opera and Google Keep behavior.

**Upgrade warning:** v0.2.5 kept unfinished drafts in temporary session storage. Copy any important unfinished drafts from its Options page *before* reloading or upgrading. On some reloads the legacy session data is already gone and cannot be migrated.

## v0.2.7 — Rich-text completion verification

Google Keep can replace an editable text node with linked text, a card preview, or different whitespace after the extension writes a URL. The old completion check could incorrectly report missing details or insert them twice even though the complete note was visible. v0.2.7 checks *all ordered fragments* of the original details inside the already-identified new editor, rather than requiring its rendered text to be one exact string. It then uses the existing native Close and observed-close checks. An actual account save is not independently verified by the extension.

If a note created with an earlier version already exists in Keep but still appears as **needs-attention** in Options, select **I verified it in Keep** only after checking the saved note in Keep. This clears the local false failure without creating a duplicate. Previous duplicate Source lines inside notes are not automatically changed. New captures will avoid adding another exact `Source: URL` if the selection already includes it.

Tested in Chromium with rich linkification and body redraw, and through the original unit suite. This does not replace a live authenticated Opera GX test.

## v0.2.8 — Automatic Close and duplicate source repair

- Keep's **Close** control may attach its handler to an interactive parent or rely on pointer/mouse events rather than the label's simple `.click()`. After verified title/body insertion, this version tries the leaf, a narrowly scoped actionable wrapper, a guarded mouse-event sequence, and finally a safe blank-area click outside the editor. Each action is followed by an observed editor-close check. **If Close cannot be confirmed, the note is not marked completed.**
- Recovery controls now appear at the lower-left of the Keep popup, away from the lower-right native Close control. For a complete but unclosed note, the assistant says **Finish this note** instead of suggesting a new insertion.
- Capture-time source attribution is canonicalized: identical source URLs inside selected text, including `2012.Source: https://...`, are removed before adding one formatted attribution at the bottom. This does not change existing notes in Google Keep or remove Google's link-preview card. Turning off Include source URL leaves user-selected content unchanged.
- **No additional permissions or network endpoints.** The original single reusable Keep popup and independent recovery records remain.

The v0.2.8 browser tests include actionable-parent Close, document click-away Close, no-op Close failure, and rich-link body persistence. They are controlled Chromium fixtures. Authentication and cloud persistence still require testing in Opera GX.

Developed with [SpeXcode - Open-Source Harness for Agentic Engineering as VS Code extension](https://github.com/SpaceXpanse/SpeXcode).
