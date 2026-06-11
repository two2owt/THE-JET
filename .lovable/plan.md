# GTM Readiness Plan

Scope: the remaining audit sweep + four GTM workstreams, sequenced so each phase is independently testable before moving on. I'll execute Phase 1 first, ask you to smoke-test, then continue.

## Phase 1 — Safe sweep + light refactors (low risk, ~15 min)

Delete (zero importers confirmed in audit):
- `src/hooks/useMovementPaths.ts`
- `src/hooks/useHeatmapTimelapse.ts`
- `src/hooks/useLocationDensity.ts`
- `src/hooks/useOfflineMapCache.ts`
- `src/hooks/useSearchHistory.ts`
- `src/hooks/useMultiDirectionSwipe.ts`
- `src/hooks/useIntersectionObserver.ts`
- `src/components/ui/optimized-image.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/ui/aspect-ratio.tsx`
- `src/components/ui/toggle.tsx`
- `src/utils/geospatialUtils.ts`

Toast consolidation (we're already Sonner-only):
- Delete `src/components/ui/toast.tsx`, `src/components/ui/toaster.tsx`, `src/components/ui/use-toast.ts`, `src/hooks/use-toast.ts`.
- Re-verify no residual imports with `rg "from \"@/hooks/use-toast\"|ui/toaster|ui/toast\""`.

Log hygiene:
- Wrap `console.log/warn` in `useMapboxToken.ts`, `lib/prefetch.ts`, `lib/tile-prefetch.ts`, `contexts/AuthContext.tsx` with `if (import.meta.env.DEV)`.

**Test gate:** Build passes, map renders, login still works, no console errors.

## Phase 2 — Auth E2E polish

- Verify managed Google OAuth on `/auth` (button present, redirect_uri = origin, error handling shows Sonner toast).
- Smooth post-auth redirect via `postAuthRedirect.ts` → if no profile/onboarding complete, send to `/onboarding`; else to intended deep link or `/`.
- Auth page: add inline error display, password visibility toggle, "Forgot password" link, loading state on submit button.
- Confirm email/recovery edge functions are deployed and templates render.

## Phase 3 — Visual pass (landing + JetCard + search)

- Landing ("Something's cooking in Charlotte"): tighten Dark Luxe — Syne headline w/ subtle gold underline, gradient glow CTA, ensure paper-plane asset is above the fold and animated (transform/opacity only).
- `SearchResults.tsx`: confirm JetCard match rows use consistent glassmorphic chip, icons aligned, keyboard nav (↑↓ Enter).
- `JetCard.tsx`: re-check 480px max-w, gradient save button states (saved = gold ring), share/save tap targets ≥44px.

## Phase 4 — E2E user flow audit

Walk: Landing → Sign up (Google) → Onboarding step 1 (18+) → Map → Open JetCard → Save → Share → Open Messages.
Document friction points; fix top 3 inline (no scope creep).

## Phase 5 — Analytics / funnel instrumentation

Confirm `analytics.track(...)` fires (and lands in `analytics_events`) for:
- `Signup Started`, `Signup Completed`, `Onboarding Completed`
- `JetCard Viewed`, `JetCard Saved`, `JetCard Shared`
- `Deal Viewed`, `Deal Clicked`
- `Search Performed` (already present — verify)
- `Message Sent`

Add a tiny `funnel.ts` helper that wraps `analytics.track` with a stable event-name enum so GTM dashboards stay clean.

## Out of scope (call out, don't do)
- New payment flows, new push topics, new edge functions beyond what's already deployed.
- Schema changes — none required.
- Mobile/Capacitor native build verification (separate workstream).

## Execution order
Phase 1 now → I'll report back for your smoke test → Phases 2–5 in subsequent turns, each followed by a checkpoint.
