<p align="center">
  <img src="icons/logo.png" alt="Why am I here? logo" width="160">
</p>

# Why am I here? — Focus Timer

A Firefox extension for browsing with purpose. Set a goal and a time limit,
keep your goal visible, and close a site's tabs when time runs out.

![Extension settings](screenshots/Screenshot%202026-10-04%20at%2018-18-14%20Why%20am%20I%20here%20%E2%80%94%20Settings.png)

![Extension on YouTube](screenshots/Screenshot%202026-10-04%20at%2019-21-47%20opsec%20demon%20-%20YouTube.png)

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

## Releases

Pushing a tag in the form `vX.Y.Z` verifies the matching version in
`manifest.json`, runs the tests, builds an `.xpi`, and attaches it to a GitHub
Release.

```sh
git tag v1.0.0
git push origin v1.0.0
```

## License

[MIT](LICENSE). Copyright (c) 2026 hlophlopgaming.
