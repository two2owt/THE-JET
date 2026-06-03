import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression baselines for the primary tabs at the two mobile
 * breakpoints we explicitly support: 360px (Android) and 390px (iOS).
 *
 * Purpose: catch divider / section-spacing drift caused by changes to
 * `--space-*` tokens, `divider-luxe`, `dot-gold`, `heading-luxe-eyebrow`,
 * or the `*-fluid-*` utility classes consumed by Hot, Social, Admin,
 * Settings, Messages, and Profile.
 *
 * Notes
 * - Pages render their PageShell chrome (skeletons / empty states) even
 *   without an authenticated session, which is what we want to snapshot:
 *   the *layout rhythm*, not transient data.
 * - Animations and caret blinks are disabled so screenshots are stable.
 * - Dynamic regions (avatars, timestamps, live feed, map canvas) are
 *   masked to avoid noise.
 *
 * First run: generate baselines with
 *   bunx playwright test e2e/visual-regression-tabs.spec.ts --update-snapshots
 */

const VIEWPORTS = [
  { label: "android-360", width: 360, height: 800 },
  { label: "ios-390", width: 390, height: 844 },
] as const;

const TABS = [
  { name: "hot", path: "/" },
  { name: "social", path: "/social" },
  { name: "admin", path: "/admin" },
  { name: "settings", path: "/settings" },
  { name: "messages", path: "/messages" },
  { name: "profile", path: "/profile" },
] as const;

/** Selectors for regions that are not stable enough to snapshot. */
const DYNAMIC_MASKS = [
  "img",
  "canvas",
  "video",
  "[data-testid='live-event-feed']",
  "[data-testid='map-canvas']",
  "[data-dynamic='true']",
  "time",
];

async function prepare(page: Page) {
  // Kill all animations / transitions so screenshots are deterministic.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  // Give the layout one frame to settle after style injection.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  );
}

for (const vp of VIEWPORTS) {
  test.describe(`tabs @ ${vp.label} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const tab of TABS) {
      test(`${tab.name} layout matches snapshot`, async ({ page }) => {
        await page.goto(tab.path, { waitUntil: "networkidle" });
        await prepare(page);

        const mask = DYNAMIC_MASKS.map((s) => page.locator(s));

        await expect(page).toHaveScreenshot(
          `${tab.name}-${vp.label}.png`,
          {
            fullPage: true,
            mask,
            // Allow tiny sub-pixel font-rendering noise.
            maxDiffPixelRatio: 0.01,
            animations: "disabled",
            caret: "hide",
          },
        );
      });
    }
  });
}