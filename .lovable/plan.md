# JET — Launch Plan

Total: ~5 phases. Each phase ends in a state you can review before I move on. Confirm the whole plan, or tell me to skip/reorder phases.

---

## Phase 1 — Technical Checklist Audit (read-only, ~1 session)

Run a code + database + edge function + live Playwright sweep over your 15-item checklist and produce a written report with severity-tagged findings. **No code edits in this phase** — just diagnosis so we don't fix the wrong things.

Each item gets: status (✅ / ⚠️ / ❌), evidence (file:line, log excerpt, or screenshot), and a proposed fix.

| # | Item | How I'll verify |
|---|---|---|
| 1 | User registration & login | Playwright: email/pw + Google OAuth end-to-end against live preview |
| 2 | Password reset | Playwright: request reset → intercept email log → set new pw → sign in |
| 3 | Email verification | Playwright: signup → verify link → onboarding gate |
| 4 | Push notifications | Inspect FCM registration, `push_subscriptions` writes, `notify-favorite-update` invocations |
| 5 | Payments | Inspect Stripe wiring; document the missing webhook |
| 6 | GPS / location services | Playwright: permission prompt, `user_locations` write, retention job |
| 7 | Chat / messaging | Playwright: 2-user DM, realtime delivery, unread badge, image upload |
| 8 | Booking / request workflows | Confirm venue reservation deep-links + tel: fallbacks |
| 9 | User profile management | Playwright: edit profile, avatar, privacy toggles, discoverable |
| 10 | Privacy settings | RLS spot-check + JSONB field-level visibility |
| 11 | Analytics | `analytics_events` write coverage across canonical funnel events |
| 12 | Crash reporting | Sentry init + ErrorBoundary forwarding (just wired) |
| 13 | Error logging | Console/log surface, edge function log review |
| 14 | Security testing | Run `security--run_security_scan`, review scan results |
| 15 | API performance | `supabase--slow_queries`, `db_health`, edge function p95 |

**Deliverable:** `LAUNCH_AUDIT.md` in project root with the report.

---

## Phase 2 — Fix Blockers + Ship Stripe Webhook (~1 session)

Fix only items rated ❌ or ⚠️ in Phase 1 that block store submission. Guaranteed-in-scope:

- **`stripe-webhook` edge function** — new function that handles `checkout.session.completed`, `customer.subscription.updated`, `.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`. Writes to a new `subscribers` table so state syncs without a client refresh.
- **`STRIPE_WEBHOOK_SECRET`** — request via `add_secret`; you paste it after registering the endpoint in Stripe.
- **`subscribers` table** — migration with RLS + GRANTs, mirrors `stripe_customer_id`, `subscribed`, `product_id`, `subscription_end`.
- **`check-subscription`** — refactor to read from `subscribers` first, fall back to Stripe API.
- Any P0/P1 bugs Phase 1 surfaces.

**Deliverable:** Green Playwright run for signup → subscribe → cancel → refund; webhook logs verify state sync.

---

## Phase 3 — Automated E2E Smoke Suite (~1 session)

Add `e2e/` Playwright specs that run headless in CI. Suites:

- `auth.spec.ts` — signup, verify, resend, forgot-pw, Google OAuth deep-link
- `map.spec.ts` — permission prompt, marker load, layer toggles, JetCard open, favorite
- `deals.spec.ts` — filter, favorite, share deep-link, deal ending-soon push
- `social.spec.ts` — discoverable list, connect, message, unread badge
- `payments.spec.ts` — checkout → webhook → subscribers table → gated feature unlock
- `admin.spec.ts` — noindex, unauthorized redirect

**Deliverable:** `bunx playwright test` green; report attached.

---

## Phase 4 — Capacitor Wrap (~1 session)

Native iOS + Android shells over the existing web app. Memory already permits this path.

- Install `@capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- `capacitor.config.ts` — `appId: app.lovable.dafac77279084bdb873c58a805d7581e`, `appName: jet-around`, remote-URL hot reload for dev
- Native plugins: `@capacitor/geolocation`, `@capacitor/push-notifications`, `@capacitor/haptics`, `@capacitor/share`, `@capacitor/status-bar`, `@capacitor/splash-screen`
- Platform detection helper (`Capacitor.isNativePlatform()`) — swap web geolocation → native, web push → FCM native, `window.open` → `App.openUrl`
- Hide JET+/JETx subscription UI on iOS (memory rule; avoids Apple IAP rejection)
- Native permission strings: iOS `Info.plist` (`NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, push), Android `AndroidManifest.xml`
- Splash screen + adaptive icon config
- Written handoff: pull → `npm install` → `npx cap add ios / android` → `npm run build` → `npx cap sync` → run on device

**Deliverable:** Capacitor scaffold committed; step-by-step build/run doc; user handles the Mac/Xcode + Android Studio steps and Apple Developer ($99) / Google Play ($25) accounts.

---

## Phase 5 — Store Listing Assets (~1 session)

All assets land in `/mnt/documents/store-listing/` for download.

### 5a — Icon set
- Master **1024×1024** from JET red paper-plane + dark luxe palette (generated via imagegen premium)
- iOS set: 20/29/40/58/60/76/80/87/120/152/167/180/1024 px
- Android set: 48/72/96/144/192 (mipmap-*), 512×512 Play Store, adaptive fg/bg layers
- Favicon refresh from same master

### 5b — Screenshots (Playwright-captured, device-mockup framed)
Captured via Playwright against live preview, framed with device bezels + tagline overlays. Sets:
- iPhone 6.7" (1290×2796): Map, JetCard, Deals, Social, Favorites
- iPhone 6.5" (1242×2688): same 5
- iPhone 5.5" (1242×2208): same 5
- Android phone (1080×1920): same 5
- Android 7" + 10" tablet: hero + Map + Deals

### 5c — App description + keywords
Two variants (App Store + Play Store):
- **Name / Subtitle** (30 / 30 chars)
- **Promotional Text** (170 chars, App Store only)
- **Short Description** (80 chars, Play Store)
- **Full Description** (4000 chars) — hook, feature list, social proof placeholder, safety/privacy statement, 17+ note
- **Keyword field** (100 chars, App Store) — Charlotte, nightlife, deals, happy hour, bars, restaurants, rooftop, events, plaza midwood, uptown
- **Category picks** — Primary: Food & Drink; Secondary: Travel / Social Networking
- **Content rating** — 17+ (alcohol references)
- **Review notes** — test account creds, review-mode toggle if we hide subs on iOS

### 5d — Preview video (15–30s)
Remotion-generated MP4 using existing skill:
- Direction: Dark Luxe, gold accent, cinematic minimal
- Story: brand pulse → map zoom-in on Charlotte → JetCard reveal → favorite tap → share pill → tagline "Charlotte, elevated."
- Renders at 1920×1080 (crop for portrait store variant if needed)
- Output: `/mnt/documents/store-listing/jet-preview.mp4`

**Deliverable:** `store-listing/` folder with icons, screenshots, copy `.md` files, MP4 — ready to upload.

---

## Timeline & sign-off

Each phase is independently reviewable. Reasonable order: **1 → 2 → 3 → 4 → 5**. If you want to launch a PWA first while Capacitor is in flight, we can swap 4 to last.

**Reply with any of:**
- "Approve all, start Phase 1"
- "Start with Phase X" (skip earlier)
- Trim/change any phase
- Adjust scope on specific items (e.g. "skip preview video", "iOS only, no Android")
