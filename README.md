# Why am I here? — Focus Timer

A Firefox extension for browsing with purpose. Set a goal and a time limit,
keep your goal visible, and close a site's tabs when time runs out.

## Features

- A movable goal reminder with a shared position across tabs.
- Per-site sessions that continue across tabs and page reloads.
- Optional warning sounds, a final 10-second countdown, and a finishing tone.
- A website list, or an optional all-websites mode with confirmation.
- Browser settings, internal pages, and protected Firefox services excluded.
- 12 interface languages, with automatic browser-language detection.
- Goals and settings stored locally; no account, analytics, or data uploads.

The timer runs in the background and closes matching tabs, including pinned
tabs, when it finishes. Save your work before starting a session.

## Try it locally

1. Download or clone this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on** and select `manifest.json`.
4. Open the extension settings, add a website, and save.
5. Visit the website, enter a goal, and start a session.

No server, dependency installation, or build step is required. Temporary
extensions are removed when Firefox restarts. After editing the code, reload
the extension and refresh its settings and website tabs.

An empty website list disables reminders unless all-websites mode is enabled.
The manifest requires Firefox 140+ on desktop and 142+ on Android; Android
behavior has not been manually verified in this project.

## Tests

With Node.js installed:

```sh
node --test tests/*.cjs
```

Tests simulate browser APIs and do not replace testing in Firefox.

## Packaging for Mozilla

Create a ZIP with `manifest.json` at its root, together with:

- `background.js`, `content.js`, `core.js`, `i18n.js`, `sound.js`
- `options.html`, `options.css`, `options.js`
- `icons/intent-48.png`, `icons/intent-96.png`, `icons/intent-128.png`
- `LICENSE`

Do not wrap these files in a parent directory inside the ZIP.
The `dist/` directory is excluded from Git; distribute packaged versions
through Mozilla Add-ons or GitHub Releases.

## License

[MIT](LICENSE). Copyright (c) 2026 hlophlopgaming.
