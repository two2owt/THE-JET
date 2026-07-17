#!/usr/bin/env bash
# Build a signed iOS IPA for App Store / TestFlight upload.
#
# Requirements on the build machine (macOS only):
#   - Xcode 15+ with command line tools (`xcode-select -p`)
#   - CocoaPods (`sudo gem install cocoapods`)
#   - Bun / Node installed and `bun install` already run
#   - Signing configured. Two supported modes:
#
#   Mode A — Automatic signing (developer account added to Xcode):
#       IOS_TEAM_ID=ABCDE12345
#
#   Mode B — Manual signing with an ExportOptions.plist you provide:
#       IOS_EXPORT_OPTIONS_PLIST=/absolute/path/to/ExportOptions.plist
#
#   Optional:
#       IOS_SCHEME=App              Xcode scheme (default: App)
#       IOS_CONFIGURATION=Release   Build configuration (default: Release)
#       IOS_EXPORT_METHOD=app-store app-store | ad-hoc | development | enterprise
#       SKIP_WEB_BUILD=1            Reuse existing dist/
#
# Output:
#   build/ios/JET.ipa

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

log() { printf '\033[1;36m[ios]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[ios] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || die "iOS release builds require macOS."
command -v xcodebuild >/dev/null || die "xcodebuild not found — install Xcode."
command -v pod        >/dev/null || die "CocoaPods not found — 'sudo gem install cocoapods'."

IOS_SCHEME="${IOS_SCHEME:-App}"
IOS_CONFIGURATION="${IOS_CONFIGURATION:-Release}"
IOS_EXPORT_METHOD="${IOS_EXPORT_METHOD:-app-store}"

if [ "${SKIP_WEB_BUILD:-0}" != "1" ]; then
  log "Building web bundle (CAP_PROD=1)…"
  CAP_PROD=1 bun run build
else
  log "SKIP_WEB_BUILD=1 — reusing existing dist/"
fi

if [ ! -d ios ]; then
  log "ios/ missing — running: npx cap add ios"
  npx cap add ios
fi

log "Syncing Capacitor → ios/"
CAP_PROD=1 npx cap sync ios

log "Installing CocoaPods…"
( cd ios/App && pod install --repo-update )

BUILD_DIR="${ROOT_DIR}/build/ios"
ARCHIVE_PATH="${BUILD_DIR}/${IOS_SCHEME}.xcarchive"
EXPORT_PATH="${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Resolve ExportOptions.plist — either user-supplied or auto-generated.
if [ -n "${IOS_EXPORT_OPTIONS_PLIST:-}" ]; then
  [ -f "${IOS_EXPORT_OPTIONS_PLIST}" ] || die "IOS_EXPORT_OPTIONS_PLIST not found: ${IOS_EXPORT_OPTIONS_PLIST}"
  EXPORT_PLIST="${IOS_EXPORT_OPTIONS_PLIST}"
  log "Using ExportOptions.plist: ${EXPORT_PLIST}"
else
  : "${IOS_TEAM_ID:?Set IOS_TEAM_ID or IOS_EXPORT_OPTIONS_PLIST}"
  EXPORT_PLIST="${BUILD_DIR}/ExportOptions.plist"
  cat > "${EXPORT_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>${IOS_EXPORT_METHOD}</string>
  <key>teamID</key><string>${IOS_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>uploadBitcode</key><false/>
  <key>compileBitcode</key><false/>
  <key>stripSwiftSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict>
</plist>
EOF
  log "Generated ExportOptions.plist (${IOS_EXPORT_METHOD}, team ${IOS_TEAM_ID})"
fi

log "Archiving (${IOS_SCHEME} / ${IOS_CONFIGURATION})…"
xcodebuild \
  -workspace "ios/App/App.xcworkspace" \
  -scheme "${IOS_SCHEME}" \
  -configuration "${IOS_CONFIGURATION}" \
  -destination "generic/platform=iOS" \
  -archivePath "${ARCHIVE_PATH}" \
  clean archive \
  CODE_SIGN_STYLE=Automatic \
  ${IOS_TEAM_ID:+DEVELOPMENT_TEAM=${IOS_TEAM_ID}} \
  | xcpretty || true

[ -d "${ARCHIVE_PATH}" ] || die "Archive not produced: ${ARCHIVE_PATH}"

log "Exporting IPA…"
xcodebuild \
  -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportPath "${EXPORT_PATH}" \
  -exportOptionsPlist "${EXPORT_PLIST}" \
  | xcpretty || true

IPA_PATH="$(find "${EXPORT_PATH}" -maxdepth 2 -name '*.ipa' | head -n 1 || true)"
[ -n "${IPA_PATH}" ] || die "IPA not produced under ${EXPORT_PATH}"

log "✔ IPA ready: ${IPA_PATH}"