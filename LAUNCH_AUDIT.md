# JET — Launch Audit (Phase 1)

Read-only audit of the 15-item pre-launch checklist. Ratings:
**✅ ready** · **⚠️ needs work** · **❌ blocker**.

| # | Area | Status | Notes |
|---|---|---|---|
| 1 | Registration & login | ✅ | Google OAuth uses absolute redirect via `buildAuthRedirectUrl`; `getSession`/`getUser` split is correct. |
| 2 | Password reset | ✅ | Handled as `/auth?reset=true` mode. Optionally assert `type=recovery` on the URL hash. |
| 3 | Email verification | ✅ | Signup → `/verification-success` covers expired-link and already-verified cases. |
| 4 | Push notifications | ⚠️ | Web push (VAPID) is wired end-to-end; native (`usePushNotifications`) is a stub. Surface a toast if `saveSubscriptionToDatabase` fails so DB truth matches UI. |
| 5 | Payments (Stripe) | ⚠️ → ✅ (Phase 2) | No webhook previously — subscription state was Stripe-live-polled every 60s. **Fixed in Phase 2**: added `subscribers` table + `stripe-webhook` function; `check-subscription` now mirrors state. |
| 6 | GPS / location | ⚠️ → ✅ (Phase 2) | `process_location_data_retention()` existed but was never scheduled. **Fixed in Phase 2**: `pg_cron` job `location-data-retention` runs daily at 03:15 UTC. |
| 7 | Chat / messaging | ✅ | Realtime channels cleaned up on unmount; typing indicator throttled/expired. |
| 8 | Booking / requests | ✅ (scope) | Uses `tel:` + maps deep-links; no in-app booking. Confirm with product this is the launch scope. |
| 9 | Profile management | ✅ | Bucket is `avatars` (not `profile-avatars`). Upload/list/remove all present. |
| 10 | Privacy settings | ✅ | `can_view_profile_field` locked to authenticated/service_role; discovery goes through `discoverable_profiles` view. |
| 11 | Analytics | ⚠️ | Event names are Title Case with an `action` field, not the snake_case names the checklist assumed. Either add explicit `favorite_deal`/`share_deal` events or document the taxonomy for the analytics consumer. |
| 12 | Crash reporting | ⚠️ | Sentry init is gated on `VITE_SENTRY_DSN`. Verify the DSN is set in the production build env — otherwise crash reporting silently no-ops. |
| 13 | Error logging | ⚠️ | Edge functions only `console.log`/`error`. Add Sentry (or Logflare/Axiom) at least for payment/auth-critical functions. |
| 14 | Security | ⚠️ | Static hardening script is CI-wired but can't detect live drift (e.g. HIBP toggled off). Review `scripts/security-hardening-baseline.txt` (each line is an accepted gap) and run the live Supabase advisor before launch. |
| 15 | API performance | ⚠️ → ✅ (Phase 2) | Indexes on hot paths (messages, deals, user_locations) are in place. `useDeals` realtime was unfiltered + un-debounced, causing full-table refetch on every write. **Fixed in Phase 2**: filter `active=eq.true` + 1.5s trailing debounce. |

## Phase 2 changes shipped alongside this audit

1. **`subscribers` table** (`public.subscribers`) — RLS: owner reads, service role writes.
2. **`stripe-webhook` edge function** — verifies signature, handles `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, upserts `subscribers`. Requires `STRIPE_WEBHOOK_SECRET` and configuring the endpoint in the Stripe dashboard.
3. **`check-subscription` mirror write** — keeps `subscribers` fresh even if the webhook hasn't fired yet (e.g. immediately post-checkout).
4. **`pg_cron` job `location-data-retention`** — daily 03:15 UTC.
5. **`useDeals` realtime debounce + filter** — coalesces bursts into one refetch, subscribes only to `active=eq.true` rows.

## Remaining before launch (recommend Phase 3–5)

- **Phase 3** — Playwright smoke suite covering signup → verify → onboarding → checkout → favorite → chat.
- **Phase 4** — Capacitor wrap (iOS/Android) with native push, deep-links, geo permission strings.
- **Phase 5** — Store listing assets: icon, screenshots, preview video, description, keywords, privacy labels.

## Follow-ups the audit surfaced but that aren't in scope for Phase 2

- Add explicit `favorite_deal` / `share_deal` analytics events (or document mapping).
- Verify `VITE_SENTRY_DSN` is present in the production build env.
- Wire edge-function-side crash reporting (Sentry/Logflare) for payment/auth functions.
- Read subscription state from `public.subscribers` in `useSubscription.ts` and drop client-side 60s polling in favor of realtime on that table.
