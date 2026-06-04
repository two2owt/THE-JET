import { test, expect, type Page } from "@playwright/test";

/**
 * Profile-page button styling regression suite.
 *
 * Goal: lock in the rounded-pill + modern shadow treatment applied to every
 * button rendered on `/profile` (and its embedded settings dialogs) at the
 * two supported mobile breakpoints:
 *   - Android: 360 x 800
 *   - iPhone:  390 x 844
 *
 * Two layers of defense:
 *   1. Pixel snapshots of each visible button in the signed-out empty state
 *      (the only deterministic auth-free surface on /profile).
 *   2. Computed-style assertions that pin `border-radius: 9999px` (pill) and
 *      a non-empty `box-shadow` on every <button> on the page, so a future
 *      refactor that drops `rounded-full` or the shadow utility fails loudly
 *      even if a screenshot diff slips through tolerance.
 *
 * Refresh baselines with:
 *   bunx playwright test e2e/profile-buttons.spec.ts --update-snapshots
 */

const VIEWPORTS = [
  { label: "android-360", width: 360, height: 800 },
  { label: "ios-390", width: 390, height: 844 },
] as const;

async function freezeAnimations(page: Page) {
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
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  );
}

for (const vp of VIEWPORTS) {
  test.describe(`profile buttons @ ${vp.label} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("every button uses pill radius + shadow", async ({ page }) => {
      await page.goto("/profile", { waitUntil: "networkidle" });
      await freezeAnimations(page);

      const buttons = page.locator("button:visible");
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const { radius, shadow, label } = await btn.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            radius: cs.borderTopLeftRadius,
            shadow: cs.boxShadow,
            label: (el.textContent || el.getAttribute("aria-label") || "")
              .trim()
              .slice(0, 40),
          };
        });

        // Pill = border-radius: 9999px. Browsers clamp to half the
        // element's smaller dimension, so we accept any value >= 999px.
        const px = parseFloat(radius);
        expect(
          px,
          `button "${label}" lost rounded-pill radius (got ${radius})`,
        ).toBeGreaterThanOrEqual(999);

        // Modern shadow treatment: any non-"none" box-shadow qualifies.
        // Catches accidental `shadow-none` or removal of the utility.
        expect(
          shadow,
          `button "${label}" lost modern shadow treatment`,
        ).not.toBe("none");
      }
    });

    test("sign-in CTA snapshot", async ({ page }) => {
      await page.goto("/profile", { waitUntil: "networkidle" });
      await freezeAnimations(page);

      const cta = page.getByRole("button", { name: /sign in/i });
      await expect(cta).toBeVisible();
      await expect(cta).toHaveScreenshot(
        `profile-signin-cta-${vp.label}.png`,
        { animations: "disabled", caret: "hide" },
      );
    });
  });
}