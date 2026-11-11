---
title: Privacy — Send to Google Keep
---

# Privacy notice for Send to Google Keep

**Last revised:** November 11, 2026.

This notice describes the independent open-source extension available at [bellodox/send-to-google-keep-new](https://github.com/bellodox/send-to-google-keep-new). It is not a privacy policy for Google's own Google Keep service.

## Information processed

When you initiate a capture, the extension can access the title and URL of the current page, a selected link, and/or selected text. It constructs a note. If optional review is enabled, you can edit the title, details, and reference date before submission. If review is disabled, it attempts to submit immediately.

The **Include source URL** setting controls automatic source attribution. It does not erase URLs you deliberately include in the captured text. The optional reference date is written as note text, **not** as a reminder.

## Permissions and access

The extension requests `activeTab`, `contextMenus`, `scripting`, `storage`, `notifications`, and `alarms`. Access to `https://keep.google.com/*` is an **optional host permission** requested so the extension can interact with the signed-in Keep webpage. No Google OAuth grant, password, or private Google Keep API is required.

## Storage and disclosure

Preferences and capture/recovery records are stored locally in the browser's extension storage. Unfinished records can survive restart/reload; these may contain note titles, details, selected text, and URLs. They are **not encrypted by the extension**. In Options, you can remove individual recovery records and clear completed history. Anyone who can access your browser profile may be able to access stored data.

The extension inserts notes into the Google Keep website, where Google's own storage and privacy terms apply. Based on review of the released source, captured note contents are not sent to a developer-operated backend, third-party analytics, or advertising endpoint. This is a source-based statement, not a complete independent production network audit.

Avoid capturing passwords, API keys, secret query strings, or confidential text unless you accept that it may be saved locally and in Google Keep.

## Control and deletion

You can disable source URL attribution, use optional review, clear local recovery history, revoke the Keep host permission through browser extension settings, and uninstall the extension. Deleting local extension data **does not delete notes** already stored in Google Keep. To remove those notes, delete them in Google Keep itself.

## Technical limitations

This extension interacts with an undocumented, changeable Keep web editor. Observing a native Close transition is not proof that Google's servers have synchronized the note. Account selection depends on the Google account signed in to Keep; users should verify the avatar when switching accounts.

See the [public source and issues](https://github.com/bellodox/send-to-google-keep-new) for details. This notice is a technical disclosure, not a legal/GDPR certification.
