---
name: release
description: Prepare a Randoro release for the App Store and Google Play. Use when the user asks to prepare, run or check a release, bump the version, or write release notes or store descriptions.
---

# Release

Work through the steps in order. Ask the user anything you can't settle from the repo, with the AskUserQuestion pop-up, phrased directly ("Is this…", "Should this be…"). Show each piece of writing to the user before moving on.

## 1. Work out what's in the release

- List the commits since the last release tag (`git tag`, then `git log <tag>..HEAD`; tags are plain versions, e.g. `1.1.0`). Group them into user-facing changes and internal ones.
- Ask what each store currently has: the live App Store version, and the latest Play track and versionCode. Release notes compare against what users have now.

## 2. Update the docs

README, TODO.md, USER_NEEDS.md, CLAUDE.md and `memory/`. Keep them concise, clear and minimal: say each thing once, in plain words, and describe the app as it is now.

- README: features, screens and project structure match the app.
- TODO.md: remove what shipped; keep release tasks current.
- USER_NEEDS.md: add any new user calls. Name no one in tracked files.
- CLAUDE.md: commands and architecture notes match the code.
- `memory/`: update the "current" files (`project_context.md` current state, `project_technical.md`) and the date in `memory/memory.md`. Leave history files alone.
- Check links, file names and labels against the code, not from memory.

## 3. Update app.json

- `version` is shared by both platforms. New features bump the middle number (1.2.0); fixes only bump the last (1.1.1). Betas don't bump it.
- `android.versionCode` goes up by 1 for every Play upload, betas included. A versionCode can never be reused, even if the release is discarded.
- iOS: Xcode increments the build number per archive; `version` must be above the live App Store version.
- Commit the version bump last, once every change for the release is in.
- Run `npx expo prebuild` for each platform so the changes reach `ios/` and `android/`.

## 4. Write the release notes

For app users, in plain words, compared with what they have now.

- Add the version to the top of CHANGELOG.md (date, which stores, then Added / Changed / Fixed). The store notes are a shorter version of it.
- App Store "What's New": up to 4,000 characters.
- Google Play: up to 500 characters per language, wrapped in language tags:
  ```
  <en-GB>
  …
  </en-GB>
  ```
- Leave out internal changes (docs, refactors, build setup).

## 5. Update the app description

Ask the user to paste the current store text, then update it for the new features. Keep it simple; the app's pitch is a few taps to an unpredictable workout.

- App Store: description (4,000), promotional text (170), keywords (100).
- Google Play: short description (80), full description (4,000).

## 6. Before upload

- Build the release (CLAUDE.md has the steps) and test it on a physical iPhone and Android phone.
- After it ships, tag the release commit with the version: `git tag 1.2.0`.
