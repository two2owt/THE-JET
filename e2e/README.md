# Playwright E2E Tests

End-to-end tests that drive the live UI in a real browser with mocked
Supabase responses. Complements the Vitest component tests in
`src/components/settings/__tests__/`.

## Setup

```bash
bun install
bunx playwright install chromium --with-deps
```

## Run

```bash
# All tests (Vite dev server starts automatically on port 4173)
bunx playwright test

# Single spec, headed for debugging
bunx playwright test e2e/account-section.spec.ts --headed

# UI mode
bunx playwright test --ui
```

## Architecture

- **Harness route**: `/dev/account-test` (DEV-only, tree-shaken in prod)
  mounts `<AccountSection />` in isolation so the spec doesn't have to
  authenticate or wait for `<Profile />` data fetching.
- **Network mocking**: each spec installs `page.route(/auth\/v1\/user/)`
  which captures `PUT` calls (made by `supabase.auth.updateUser`) and
  returns deterministic success / failure payloads.
- **Assertions**: inline `role="alert"` errors, sonner toast text, and
  the captured request bodies (proving `updateUser` was called with the
  right shape — or not called at all when validation fails).

## Visual regression

`visual-regression-tabs.spec.ts` snapshots Hot, Social, Admin, Settings,
Messages, and Profile at 360px (Android) and 390px (iOS) — 12 baselines
total. The goal is catching divider / section-spacing drift in the
PageShell chrome (`divider-luxe`, `dot-gold`, `heading-luxe-eyebrow`,
`*-fluid-*` utilities, `--space-*` tokens).

First run — generate baselines locally:

```bash
bunx playwright test e2e/visual-regression-tabs.spec.ts --update-snapshots
```

Subsequent runs compare against the committed baselines under
`e2e/visual-regression-tabs.spec.ts-snapshots/`. Animations are disabled
and avatars / canvases / timestamps are masked so only layout rhythm is
compared.