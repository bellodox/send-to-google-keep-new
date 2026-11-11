# v0.2.12 validation

- 50/50 Node unit tests passed (initial build).
- Chromium fixtures verified: original body-first + Close, linkification, missing-body safe stop, two-note same-page reuse, mouse event Close, click-away Close, synchronous redraw, delayed redraw, `execCommand` false, and retained-body two-note reuse.
- New `opera-single-url-close-reset-regression.py`: v0.2.8 baseline failed due to second body activation; patched build passed with 1 body activation and 1 Close.
- No authenticated Opera GX test has been performed. No cloud-sync claim is made.
