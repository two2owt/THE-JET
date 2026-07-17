# Release build scripts

Two reproducible scripts to produce store-ready binaries from a clean checkout.
Neither can run inside the Lovable sandbox — use a local macOS machine (iOS)
or any Linux/macOS box with the Android SDK installed (Android).

## Prereqs (once per machine)

```bash
bun install
# first-time only — creates ios/ and android/ folders
npx cap add ios       # macOS
npx cap add android
```

## Android → AAB

```bash
export ANDROID_KEYSTORE_PATH=/secure/keys/jet-release.jks
export ANDROID_KEYSTORE_PASSWORD=•••
export ANDROID_KEY_ALIAS=jet-upload
export ANDROID_KEY_PASSWORD=•••
# Optional: also produce a universal APK for side-loading QA
# export ANDROID_BUILD_APK=1

./scripts/build-android-release.sh
# → android/app/build/outputs/bundle/release/app-release.aab
```

If you don't yet have a keystore:
```bash
keytool -genkey -v -keystore jet-release.jks -alias jet-upload \
        -keyalg RSA -keysize 2048 -validity 10000
```
Store it outside the repo and back it up — Play Store rejects re-uploads
signed with a different key.

## iOS → IPA (macOS only)

```bash
# Automatic signing (recommended for first releases):
export IOS_TEAM_ID=ABCDE12345          # Apple Developer team ID
# Or supply your own ExportOptions.plist for manual signing:
# export IOS_EXPORT_OPTIONS_PLIST=/path/to/ExportOptions.plist

./scripts/build-ios-release.sh
# → build/ios/App.ipa
```

Upload with Transporter.app or:
```bash
xcrun altool --upload-app -f build/ios/App.ipa \
             -t ios -u you@apple.id -p @keychain:AC_PASSWORD
```

## Common flags

| Var | Effect |
| --- | --- |
| `SKIP_WEB_BUILD=1` | Reuse existing `dist/` (skip `bun run build`) |
| `CAP_PROD=1` | Set automatically by scripts — disables live-reload URL in `capacitor.config.ts` |

## Notes

- `android/keystore.properties` is generated at build time and git-ignored;
  the script also patches `android/app/build.gradle` once to consume it.
- The iOS script generates an ExportOptions.plist on demand when
  `IOS_TEAM_ID` is provided; supply your own via
  `IOS_EXPORT_OPTIONS_PLIST` for enterprise / manual profiles.
- CI: wire either script into GitHub Actions with signing files delivered
  via encrypted secrets (`base64 -d` a keystore, `security import` a p12).