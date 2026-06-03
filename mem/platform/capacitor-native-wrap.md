---
name: Capacitor native wrap (secondary target)
description: iOS + Android wrapping via Capacitor, web remains primary deploy target
type: feature
---
Web (Lovable + Vercel) is the primary deploy target. Capacitor is a parallel build target for App Store / Play Store submission only.

- Config: `capacitor.config.ts` (appId `app.lovable.dafac77279084bdb873c58a805d7581e`, appName `JET`, webDir `dist`).
- Hot-reload `server.url` points to Lovable preview; disabled when `CAP_PROD=1`.
- Plugins installed: app, haptics, status-bar, splash-screen, push-notifications, geolocation, share.
- Native folders (`ios/`, `android/`) are generated locally via `npx cap add` — NOT committed from Lovable.
- iOS subscription UI is hidden via `canPurchaseSubscription()` in `src/lib/platform.ts` to comply with App Store IAP policy. Subscriptions are web-only on iOS.
- Build/submission guide: `NATIVE_BUILD.md`.

**Why:** GTM rating flagged PWA-only as a distribution handicap. Native wrap unlocks store presence without rewriting the React app.

**How to apply:** Never call native plugins unconditionally — always guard with `isNativeApp()` / `isIOSNative()` from `src/lib/platform.ts` so the web bundle keeps working in the browser.
