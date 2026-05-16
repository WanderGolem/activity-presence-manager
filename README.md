# Activity Presence Manager

Desktop app for managing Discord Rich Presence for Twitch, YouTube, and custom activities.

## Features

- Discord Rich Presence for stream activity
- Managed Twitch status API by default
- Optional custom Twitch API credentials
- YouTube and custom activity modes
- Presets, preview, stream info, app language, and activity language
- Windows installer and portable build through electron-builder
- GitHub Releases based updater through electron-updater

## Development

Install dependencies:

```powershell
npm.cmd install
```

Start the app in development mode:

```powershell
npm.cmd start
```

## Build

Create an unpacked local test build:

```powershell
npm.cmd run pack
```

Create the Windows installer and portable build:

```powershell
npm.cmd run dist
```

Build output is written to:

```text
dist/
```

## Releases And Updates

The auto-updater uses GitHub Releases. Before publishing a new update:

1. Increase `version` in `package.json`.
2. Commit and push the change.
3. Create a tag, for example `v1.4.1`.
4. Push the tag to GitHub.

```powershell
git tag v1.4.1
git push origin v1.4.1
```

The GitHub Actions workflow builds the Windows installer and uploads the updater files to the release.

If the GitHub repository is not `WanderGolem/activity-presence-manager`, update `repository.url` and `build.publish` in `package.json`.

## Local Release Publishing

To publish from your own machine instead of GitHub Actions, create a GitHub token with release permissions and run:

```powershell
$env:GH_TOKEN="YOUR_TOKEN"
npm.cmd run release
```

Never commit `.env`, tokens, or code signing certificates.

## Code Signing

The app can be built without code signing, but Windows may show SmartScreen warnings. For fewer warnings, configure a Windows code signing certificate before public releases.
