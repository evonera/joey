# Desktop releases

Joey desktop releases are built by `.github/workflows/desktop-release.yml` when an `app-v*` tag is pushed. The workflow creates a draft GitHub release with macOS arm64 and x64, Linux x64, and Windows x64 bundles plus signed Tauri updater artifacts.

## Required repository secrets

- `TAURI_SIGNING_PRIVATE_KEY`: the private key generated with `npm run tauri signer generate`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password protecting that key.

Keep the private key outside the repository and back it up securely. Losing it prevents existing installations from trusting future updater artifacts. Platform-native signing and notarization credentials can be added as repository secrets when distribution through macOS and Windows trust channels is enabled.

## Publishing

1. Update `src-tauri/tauri.conf.json` to the release version and merge it.
2. Push a matching tag such as `app-v0.2.0`.
3. Inspect the generated draft release and its updater signatures.
4. Publish the draft after installing and smoke-testing the bundles.

## Distribution & Companion Architecture

Joey Desktop is built as a lightweight **Menu Bar Companion & Quick Capture** utility:

- **Global Quick Capture**: Press `Cmd+Shift+J` (macOS) or `Ctrl+Shift+J` (Windows/Linux) from any application to quickly capture an idea or post link for Joey to draft. Features the Joey yellow cat mascot.
- **Live Tray Badge**: Reflects real-time pending drafts (e.g. `Joey (3)`) and periodic native OS notifications when new drafts require review.
- **Direct Web Distribution**: Direct download (`.dmg` for macOS, `.exe` for Windows) via `joey.evonera.com/download` is recommended over the Mac App Store to support unrestricted global shortcuts and avoid store cut on subscriptions, with Apple Developer notarization (`xcrun notarytool`) ensuring clean installs.
