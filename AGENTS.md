# Repository guidelines

## Project

This is a dependency-free Firefox Manifest V3 extension. Keep source files directly runnable by Firefox: do not introduce a bundler, package manager, remote code, or a server unless the task explicitly requires it.

- `background.js` owns persistence, alarms, session coordination, and tab closing.
- `content.js` renders the prompt and timer in a closed Shadow DOM.
- `core.js` contains shared validation and domain logic.
- `options.*` implements the settings page.
- `i18n.js` contains all supported interface translations.

## Changes

- Use tabs for indentation in JavaScript, matching the existing source.
- Reuse existing browser APIs and helpers before adding abstractions or dependencies.
- Insert user-controlled text with `textContent` or `value`, never `innerHTML`.
- Keep behavior consistent across all tabs and subdomains belonging to a session.
- Update translations when adding or changing user-visible text.

## Verification

Run the complete dependency-free test suite with Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

For UI or keyboard changes, also reload the temporary extension in Firefox, refresh the target page, and verify the affected interaction on the real site. Automated VM tests do not replace this check.

## Releases

The version lives in `manifest.json`. For a release, bump it, commit the change, create a matching `vX.Y.Z` tag, and push both the branch and tag. The tag-triggered GitHub Actions workflow runs tests and creates the `.xpi` GitHub Release.
