# Fake-mouse-mover

A desktop tray tool built with Electron that keeps your mouse "active" (useful for avoiding an idle/away status in apps like Microsoft Teams), with a built-in Pomodoro timer for tracking focused work sessions.

## Features

- **Mouse Mover** — nudges the mouse randomly every 10 seconds and returns it to its original position, so you don't show as away.
- **Pomodoro timer** — editable work/break durations (default 45 min work / 5 min break), with Start/Pause/Resume/Stop controls and a system notification when each phase ends.
- **Daily total tracker** — tracks accumulated work + break time toward an 8-hour work day, persisted across app restarts and reset automatically each day.

Both features run independently in the background and can be used at the same time.

## Development

```bash
npm install
npm start
```

## Releasing

Releases are built and published automatically by GitHub Actions (`.github/workflows/build.yml`), but **only when a `v*` tag is pushed** — pushing commits to `main` alone does not trigger a build or release.

To cut a new release:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

This triggers the workflow to build the Linux (`.AppImage`), Windows (`.exe`), and Mac (`.dmg`) binaries and attach them to a GitHub Release for that tag. Check the *Actions* tab on GitHub to follow build progress.
