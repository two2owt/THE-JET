# JET — Native Build Guide (iOS + Android via Capacitor)

The web app remains the primary deploy target. This guide covers wrapping the
same `dist/` bundle into native shells for the App Store and Play Store.

## Identifiers

- **App ID (bundle id / package)**: `app.lovable.dafac77279084bdb873c58a805d7581e`
- **App name**: `JET`
- **Background color**: `#0A0A0A` (matches Dark Luxe theme)

Once you have your own Apple/Google developer accounts, you'll likely want to
change the app ID to something like `com.jetaround.app`. Update
`capacitor.config.ts` → `appId`, then run `npx cap sync`.

## Local build prerequisites

- **macOS** with Xcode 15+ (required for iOS — no way around this)
- **Android Studio** Hedgehog (2023.1.1) or newer
- **Node 20+** and **bun**
- **CocoaPods**: `sudo gem install cocoapods`

Lovable itself cannot produce `.ipa` or `.aab` files — you must clone the repo
to your own machine.

## First-time setup

```bash
# 1. Export project to GitHub (Lovable: top-right → GitHub → Export)
git clone <your-repo-url>
cd jet-around

# 2. Install deps
bun install

# 3. Build web bundle
bun run build

# 4. Add native platforms (one-time)
npx cap add ios
npx cap add android

# 5. Sync web bundle + plugins into native projects
npx cap sync
```

## Day-to-day dev (hot reload from Lovable sandbox)

`capacitor.config.ts` points `server.url` at the Lovable preview by default,
so a physical device running the app loads the latest Lovable build live.

```bash
npx cap run ios       # opens Simulator / device picker
npx cap run android   # opens emulator / device picker
```

## Producing a release build

```bash
# Switch to bundled assets (disables hot-reload server.url)
CAP_PROD=1 bun run build
CAP_PROD=1 npx cap sync

# iOS — opens Xcode; Product → Archive → Distribute App
npx cap open ios

# Android — opens Android Studio; Build → Generate Signed Bundle (.aab)
npx cap open android
```

## Generating icons + splash screens

Drop a 1024x1024 icon and 2732x2732 splash into `resources/`:

```bash
mkdir -p resources
# resources/icon.png    (1024x1024, opaque)
# resources/splash.png  (2732x2732, #0A0A0A background)
npx capacitor-assets generate --iconBackgroundColor '#0A0A0A' --splashBackgroundColor '#0A0A0A'
```

## Store submission checklist

### Apple App Store
- [ ] Apple Developer Program enrollment ($99/yr)
- [ ] App Store Connect listing created
- [ ] Age rating: **17+** (alcohol references, user-generated content)
- [ ] Privacy nutrition label: location (precise + coarse), contact info, identifiers, usage data
- [ ] `NSLocationWhenInUseUsageDescription` in `ios/App/App/Info.plist` — "JET uses your location to show nearby venues and deals in Charlotte."
- [ ] `NSLocationAlwaysAndWhenInUseUsageDescription` if you keep geofence alerts
- [ ] EULA + Privacy Policy + Terms URLs (already at `/privacy-policy`, `/terms-of-service`)
- [ ] Report/block user flow visible in app (Guideline 1.2 for UGC)
- [ ] Subscription UI is hidden inside iOS shell (already gated via `canPurchaseSubscription()`)
- [ ] Do **not** link out to web checkout from inside iOS app — Apple will reject
- [ ] TestFlight build uploaded for internal review before public submission

### Google Play Store
- [ ] Google Play Console one-time $25 fee
- [ ] 12-tester closed beta for 14 days (new personal accounts only)
- [ ] Data safety form: location, personal info, app activity
- [ ] `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` in `android/app/src/main/AndroidManifest.xml`
- [ ] `POST_NOTIFICATIONS` permission for Android 13+
- [ ] Target SDK 34+ (Google Play requirement as of Aug 2024)
- [ ] Content rating: Mature 17+

## Things that will bite you

1. **Service worker conflict** — your PWA service worker (`public/sw-push.js`)
   may conflict with Capacitor's local file serving. Test push thoroughly; if
   it breaks, gate SW registration with `!isNativeApp()` from `src/lib/platform.ts`.
2. **Mapbox native SDK** — currently you use Mapbox GL JS in a WebView. Works
   but heavier than the native SDK. Re-price at scale.
3. **Deep links** — universal links (iOS) and app links (Android) need
   `apple-app-site-association` + `assetlinks.json` hosted on `jet-around.com`.
4. **Every native release = 24–48hr Apple review.** Plan accordingly.