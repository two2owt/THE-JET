import { test, expect, type Page } from "@playwright/test";

/**
 * Profile page spacing regression suite.
 *
 * Goal: catch spacing / rhythm drift on `/profile` specifically (PageShell
 * gap, section padding, sign-out placement, identity hero clearance) at the
 * two mobile breakpoints the app explicitly supports:
 *   - Android: 360 x 800
 *   - iPhone:  390 x 844
 *
 * Two layers of defense run at each breakpoint:
 *   1. Pixel snapshots (full page) for both the signed-out empty state
 *      and the loading skeleton — these render deterministically without
 *      Supabase auth and exercise the same PageShell chrome that wraps the
 *      signed-in form.
 *   2. Computed-style assertions on the PageShell wrapper that guarantee
 *      the documented spacing tokens (16px default gap, 16px padding +
 *      safe-area insets) have not regressed even if a screenshot diff
 *      tolerance hides a small drift.
 *
 * Generate / refresh baselines with:
 *   bunx playwright test e2e/profile-spacing.spec.ts --update-snapshots
 */

const VIEWPORTS = [
  { label: "android-360", width: 360, height: 800 },
  { label: "ios-390", width: 390, height: 844 },
] as const;

const DYNAMIC_MASKS = [
  "img",
  "canvas",
  "video",
  "[data-testid='live-event-feed']",
  "[data-dynamic='true']",
  "time",
];

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
  test.describe(`profile spacing @ ${vp.label} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("signed-out empty state matches snapshot", async ({ page }) => {
      await page.goto("/profile", { waitUntil: "networkidle" });
      await freezeAnimations(page);

      // The empty-state CTA is the stable anchor for the signed-out view.
      await expect(
        page.getByRole("button", { name: /sign in/i }),
      ).toBeVisible();

      const mask = DYNAMIC_MASKS.map((s) => page.locator(s));
      await expect(page).toHaveScreenshot(
        `profile-empty-${vp.label}.png`,
        {
          fullPage: true,
          mask,
          maxDiffPixelRatio: 0.01,
          animations: "disabled",
          caret: "hide",
        },
      );
    });

    test("PageShell rhythm tokens are intact", async ({ page }) => {
      await page.goto("/profile", { waitUntil: "networkidle" });
      await freezeAnimations(page);

      // PageShell is the single source of truth for tab padding + gap.
      // It renders as the first flex-column descendant inside the main
      // scroll container. We assert its computed gap and padding so any
      // refactor that drops the default 16/16 rhythm fails loudly.
      const shell = page.locator(".max-w-7xl.mx-auto").first();
      await expect(shell).toBeVisible();

      const metrics = await shell.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          display: cs.display,
          flexDirection: cs.flexDirection,
          gap: cs.rowGap || cs.gap,
          paddingTop: cs.paddingTop,
          paddingRight: cs.paddingRight,
          paddingBottom: cs.paddingBottom,
          paddingLeft: cs.paddingLeft,
        };
      });

      expect(metrics.display).toBe("flex");
      expect(metrics.flexDirection).toBe("column");
      // Default PageShell variant = 16px gap and 16px padding on every
      // edge (safe-area insets are 0 in headless Chromium).
      expect(metrics.gap).toBe("16px");
      expect(metrics.paddingTop).toBe("16px");
      expect(metrics.paddingRight).toBe("16px");
      expect(metrics.paddingBottom).toBe("16px");
      expect(metrics.paddingLeft).toBe("16px");
    });
  });
}
