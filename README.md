# Nisaba

Electron + React desktop app.

```bash
npm install
npm run dev      # dev with HMR
npm run dist     # local installer in dist/
```

## Releasing

Bump `version` in package.json, then:

```bash
git tag v0.0.2 && git push --tags
```

The `release` workflow builds mac/win/linux and publishes to GitHub Releases.
Installed apps pull updates from there on launch (`autoUpdater`).
