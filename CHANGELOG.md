# Changelog

## 1.0.4 — 2026-10-11

### Added

- The goal field is focused automatically, so typing can start without an extra click.
- The goal prompt displays the detected `RU` or `EN` keyboard layout after the first typed letter.
- Goals containing only numbers are rejected with a clear, translated error.
- The goal prompt can close all tabs belonging to the current site immediately.

### Changed

- The Start session button becomes available as soon as a goal is entered.
- The time-limit note now accurately describes whether subdomains are included.

### Fixed

- Closing every matching tab no longer closes the last Firefox window.
- The goal prompt returns if a website removes the extension overlay while rendering.
- Early timer alarms are rescheduled so the final countdown is not lost.
