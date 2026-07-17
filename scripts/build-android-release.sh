#!/usr/bin/env bash
# Build a signed Android AAB (and optional APK) for Play Store upload.
#
# Requirements on the build machine (not the Lovable sandbox):
#   - JDK 17+, Android SDK + platform-tools, Gradle wrapper (bundled with cap add android)
#   - Bun (or Node) installed and `bun install` already run
#   - A release keystore file. Configure via env vars:
#       ANDROID_KEYSTORE_PATH      Absolute path to the .keystore/.jks file
#       ANDROID_KEYSTORE_PASSWORD  Store password
#       ANDROID_KEY_ALIAS          Key alias inside the keystore
#       ANDROID_KEY_PASSWORD       Key password (often same as store password)
#     Optional:
#       ANDROID_BUILD_APK=1        Also assemble a universal release APK
#       SKIP_WEB_BUILD=1           Reuse existing dist/ (skip bun run build)
#
# Output:
#   android/app/build/outputs/bundle/release/app-release.aab
#   android/app/build/outputs/apk/release/app-release.apk   (if ANDROID_BUILD_APK=1)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

log() { printf '\033[1;36m[android]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[android] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

: "${ANDROID_KEYSTORE_PATH:?ANDROID_KEYSTORE_PATH is required}"
: "${ANDROID_KEYSTORE_PASSWORD:?ANDROID_KEYSTORE_PASSWORD is required}"
: "${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS is required}"
: "${ANDROID_KEY_PASSWORD:?ANDROID_KEY_PASSWORD is required}"

[ -f "${ANDROID_KEYSTORE_PATH}" ] || die "Keystore not found: ${ANDROID_KEYSTORE_PATH}"

if [ "${SKIP_WEB_BUILD:-0}" != "1" ]; then
  log "Building web bundle (CAP_PROD=1)…"
  CAP_PROD=1 bun run build
else
  log "SKIP_WEB_BUILD=1 — reusing existing dist/"
fi

if [ ! -d android ]; then
  log "android/ missing — running: npx cap add android"
  npx cap add android
fi

log "Syncing Capacitor → android/"
CAP_PROD=1 npx cap sync android

# Write signing config into android/keystore.properties (git-ignored).
KEYSTORE_PROPS="${ROOT_DIR}/android/keystore.properties"
cat > "${KEYSTORE_PROPS}" <<EOF
storeFile=${ANDROID_KEYSTORE_PATH}
storePassword=${ANDROID_KEYSTORE_PASSWORD}
keyAlias=${ANDROID_KEY_ALIAS}
keyPassword=${ANDROID_KEY_PASSWORD}
EOF
chmod 600 "${KEYSTORE_PROPS}"

# Patch android/app/build.gradle to consume keystore.properties (idempotent).
APP_GRADLE="${ROOT_DIR}/android/app/build.gradle"
if [ -f "${APP_GRADLE}" ] && ! grep -q "keystore.properties" "${APP_GRADLE}"; then
  log "Injecting release signingConfig into android/app/build.gradle"
  python3 - "$APP_GRADLE" <<'PY'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text()

load_block = '''
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
'''
if 'keystorePropertiesFile' not in src:
    src = load_block + src

signing_block = '''
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
'''

src = re.sub(
    r'(buildTypes\s*\{\s*release\s*\{)',
    signing_block + r'\n    \1\n            signingConfig signingConfigs.release',
    src,
    count=1,
)
p.write_text(src)
PY
fi

log "Assembling release bundle (AAB)…"
pushd android >/dev/null
./gradlew --no-daemon clean :app:bundleRelease
if [ "${ANDROID_BUILD_APK:-0}" = "1" ]; then
  log "Assembling release APK…"
  ./gradlew --no-daemon :app:assembleRelease
fi
popd >/dev/null

AAB_PATH="android/app/build/outputs/bundle/release/app-release.aab"
[ -f "${AAB_PATH}" ] || die "Expected artifact missing: ${AAB_PATH}"

log "✔ AAB ready: ${AAB_PATH}"
[ -f "android/app/build/outputs/apk/release/app-release.apk" ] && \
  log "✔ APK ready: android/app/build/outputs/apk/release/app-release.apk" || true