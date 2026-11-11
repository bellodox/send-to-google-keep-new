# Test report — 0.2.8

- 50/50 Node tests passed (`npm test`).
- Existing Chromium editor fixtures passed: composer, popup, body replacement, source-link preview, two-note reuse, and recovery.
- New Chromium regressions passed: mouse-down handler on a Close wrapper and click-away Close on an inert page surface. Both assert no save when details truly disappear.
- Negative control: 0.2.7 fails the wrapper-activation test; 0.2.8 passes.
- No-op Close unit test still requires a failure response rather than reporting success.
- Unit tests cover exact and equivalent source URL deduplication, including inline `2012.Source: URL`, tracking-parameter normalization, and the Include URL disabled setting.

These are offline tests against mocked browser interfaces. A live authenticated Opera GX run is required to verify real Keep behavior and cloud persistence.
