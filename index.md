---
title: Send to Google Keep — Opera extension
---

# Send to Google Keep for Opera

**Save webpages, links, and selected text directly to Google Keep.** Optionally review the title, reference date, and details before sending. By default, you can capture a note in one action.

> **Independent open-source extension.** Not developed, sponsored, or endorsed by Google. It operates the Google Keep website in your signed-in browser; it does not use an official Keep API.

## Install (Opera GX / Opera / Chromium)

1. Get the extension source from [the project repository](https://github.com/bellodox/send-to-google-keep-new), extract it to a permanent folder, and select the version you intend to install.
2. Open `opera://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the `extension` folder (containing `manifest.json`). Do not install two copies of the extension.
4. Open **Options** and allow access to `https://keep.google.com/*` when requested.
5. Sign in at [Google Keep](https://keep.google.com/) and use the extension icon or context menu to capture a page, link, or selection.

**Version note:** The confirmed working Opera GX version is **v0.2.12**. At the time this page was prepared, the GitHub repository still contained **v0.2.8**. Check `extension/manifest.json` before installation; update the repository source to v0.2.12 separately. The website files do not modify the extension.

## Features

- **One-click capture** of a webpage, link, or text selection.
- **Optional review** to edit the note title, details, and reference date before sending.
- **Optional source URL**, included once when enabled in Options.
- **One reusable compact Keep popup** for normal consecutive captures.
- **Local recovery** for incomplete or uncertain submissions, without blindly resending possibly saved notes.
- **No Google OAuth, passwords, private Keep API, developer server, or third-party analytics** in the released extension source.

The optional reference date is stored as **plain note text**; it does **not** create a Google Keep reminder.

## How it works

With **Review every note before sending** switched off, the extension captures the selected information and attempts to insert the note in the reusable Keep popup. With review on, you edit the draft first and click **Send to Google Keep**. Google Keep's native editor handles storage and synchronization under your signed-in account.

Google Keep can change its webpage without warning. The extension can observe the editor closing but **cannot independently prove cloud synchronization**. For sensitive information, verify the saved note in Keep before relying on it.

## Troubleshooting

**Nothing is inserted:** Open the extension's Options and confirm that Keep site access was granted. Ensure you are signed in to Keep.

**Note is marked needs attention:** Inspect the same note inside Keep before retrying. It may already have been inserted. Use the extension's recovery controls rather than resubmitting the whole note.

**Duplicate windows or competing actions:** Disable other installed copies of the extension and reload the intended version.

**A note has the wrong account:** Check the Google account avatar in Keep; the extension cannot verify account identity from the web editor alone.

## Privacy and source

This extension uses browser-local storage for preferences and unfinished capture records, which can contain selected text, page titles, and source URLs. Read the [privacy notice](privacy) before saving confidential information.

[Source on GitHub](https://github.com/bellodox/send-to-google-keep-new) · [MIT License](https://github.com/bellodox/send-to-google-keep-new/blob/main/LICENSE) · [Privacy notice](privacy) · [Report an issue](https://github.com/bellodox/send-to-google-keep-new/issues)

Developed with [SpeXcode — Open-Source Agentic Engineering Harness](https://github.com/SpaceXpanse/SpeXcode).
