# “Why am I here?” 1.0.0

An extension for desktop Firefox 140+. Manifest V3, an event page, and no npm dependencies, bundler, server, or analytics. All code is included in the archive. For usage instructions, see START-HERE.html.

## Architecture

- `core.js`: domain normalization, matching, settings and duration validation, and time formatting.
- `background.js`: a sequential operation queue, settings and session persistence, browser.alarms, warnings, tab closing, and tab synchronization.
- `content.js`: the form and reminder inside a closed Shadow DOM; Web Audio as a sound fallback. User-provided values are inserted only through textContent/value.
- `options.html`, `options.css`, `options.js`: settings, sound testing, and active sessions.
- `sounds/warning.wav`: a local three-tone alert. `icons/`: local PNG files.
- `tests/background.test.cjs`: automated checks using Node 18+ with the built-in node:test and VM. These checks do not replace full E2E testing in Firefox.
- `tools/generate-assets.py`: reproducible icon and sound generation (Python 3, Pillow). Running it is not required to use the extension.

In the ZIP archive, manifest.json and the extension files are at the root; in the working source project, they are in extension/. The tests and generator support both layouts.

## Testing

```sh
node --test tests/background.test.cjs
```

In the working source project:

```sh
node --test site-intent/tests/background.test.cjs
```

Scenarios covered: exact domain boundaries, IDN and subdomain normalization, nonnumeric durations, simultaneous starts, a shared deadline, tabs in different windows and pinned tabs, navigation to another domain during closing, a single warning, disabled sound and fallback playback, background page recreation, an expired persisted timer, closing the last tab, disabling and removing a site, sender validation, an early alarm, and fallback closing requested by a page.

## Behavior

There is one session per domain, covering all its subdomains and ports. Parent domains remove redundant subdomains from the list. The deadline is an absolute Date.now() timestamp stored in browser.storage.local. In the background page, browser.alarms handles the warning and session end; open pages also check whether the deadline has passed. This protects against throttling of regular JS timers in background tabs.

Closing or navigating away from all tabs for a site ends the session. Visiting again prompts for a new intention. There is no enforced break. Disabling the extension through settings cancels sessions without closing tabs. Starting again does not extend an existing session. New warning and opacity settings apply to current sessions; a warning that has already played is not repeated.

State is restored when the background page loads. Time spent with the computer asleep counts toward the limit, but tabs can only close after it wakes up. The alarms API may fire late; this is not a real-time timer. A temporary installation does not survive a full Firefox restart.

## Limitations

This is a Firefox extension; it requires changes to the manifest and background audio handling to work in Chrome. It supports ordinary HTTP/HTTPS pages, except for Firefox-protected domains. Private windows require user permission. Sites may remove DOM nodes, cover the overlay with fullscreen elements, or behave unexpectedly; the extension is not designed to prevent deliberate circumvention by the user.

A single warning plays in the background page from a local WAV file. If playback fails, the request is sent to one tab for the site, preferably the active tab. The fallback Web Audio context is unlocked when the form is submitted. Autoplay restrictions, system volume, and muted audio may prevent the alert from being heard; closing tabs and displaying the visual warning do not depend on sound.

The tab URL is checked again before closing. There is an unavoidable small gap between the check and tabs.remove itself: these APIs do not offer an atomic “close only if the URL matches” operation. Unsaved data may be lost as an inherent consequence of automatic tab closing.

## Installation and signing

The ZIP can be selected as a temporary add-on in about:debugging. Permanent installation requires Mozilla signing; the source is ready to submit for review through AMO. The archive is unsigned and unpublished.

Official documentation:

- https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/
- https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/remove

Use tabs for indentation when making changes. The full text of the user's intention is not logged.


## Update: position, language, and logo

- `reminderPosition` is stored separately in `browser.storage.local`. Moving the reminder with the mouse or arrow keys saves its position through `SAVE_POSITION` and broadcasts it to all tabs. New tabs receive the coordinates through `GET_STATE`; in a small window, the reminder is constrained to the screen boundaries without changing the saved coordinates.
- `config.language`: defaults to `auto`, which uses the Firefox interface language through `browser.i18n.getUILanguage()`, with English as the fallback for unsupported languages. Available languages are en, ru, de, es, fr, it, pl, zh (Simplified Chinese), hi (Hindi), ar, pt, and tr. A saved manual selection takes precedence; old settings without a language migrate to auto. The Arabic interface uses right-to-left layout. Translations are in `i18n.js`; user intentions are not translated.
- New example intention: learn a new language or study a subject.
- Logo: `icons/logo.png`; configured sizes: `icons/intent-48.png`, `icons/intent-96.png`, `icons/intent-128.png`. The prompt and generation method are in `icons/LOGO.md`. The old generator, `tools/generate-assets.py`, creates the legacy `icon-*.png` files without affecting the new icons.
- Testing: `node --test tests/background.test.cjs`. After updating the temporary extension in `about:debugging`, reload open site pages to load the new content scripts.


Sound alerts are generated through Web Audio in `sound.js`: three tones for the warning and one for the countdown. The test button uses the same mechanism. WAV files are no longer used for playback. Waiting for audio to unlock is limited to 500 ms to avoid delaying timer processing; if background playback is blocked, the existing mechanism sends the alert to one tab.


## Site selection

The global `enabled` toggle has been removed. In normal mode, only domains in `sites` are active; an empty list disables reminders. The old `enabled` field is ignored during migration, and the saved site list is retained.

`allSites` defaults to `false`. Enabling it in settings requires confirmation through a system dialog, followed by saving the settings. In this mode, sites outside the list get separate timers by hostname (www is grouped with the base hostname); listed domains still include their subdomains. When the mode changes, sessions that no longer match are canceled without closing tabs.

Only HTTP/HTTPS pages are handled. Internal and other unsupported schemes (`about:`, `chrome:`, `moz-extension:`, `file:`, and others) are excluded; protected Firefox services are also excluded by the shared site-detection function, including from automatic tab closing.
