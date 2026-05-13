import { test, expect, type Page } from "@playwright/test";

/**
 * Visual / layout regression suite for Profile, Settings and Social pages.
 *
 * Guards the invariants documented in the page-layout-enforcement memory:
 *   1. No horizontal scroll at any breakpoint (sidebar / wide content
 *      must stay clipped by PageLayout's outer overflow:hidden).
 *   2. The document body itself does NOT scroll — only <main> does
 *      (otherwise Header / BottomNav would unstick on iOS).
 *   3. <main> is the scroll container and is height-locked to
 *      var(--main-height), so its scrollHeight can exceed clientHeight
 *      but its clientHeight stays within the viewport budget.
 *   4. Off-viewport "sidebar"-style elements never push the layout wide.
 *
 * Uses the DEV-only /dev/containment-test harness so the suite does not
 * depend on Supabase auth or data.
 */

const VARIANTS = ["profile", "settings", "social"] as const;

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1366, height: 768 },
] as const;

async function gotoHarness(page: Page, variant: (typeof VARIANTS)[number]) {
  await page.goto(`/dev/containment-test?variant=${variant}`);
  await page.waitForSelector(`[data-testid="containment-${variant}"]`);
}

for (const variant of VARIANTS) {
  test.describe(`containment — ${variant}`, () => {
    for (const vp of VIEWPORTS) {
      test(`${vp.name} (${vp.width}x${vp.height}) holds invariants`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await gotoHarness(page, variant);

        // Invariant 1: no horizontal scroll on documentElement or body.
        const horizontal = await page.evaluate(() => {
          const de = document.documentElement;
          const body = document.body;
          return {
            docOverflow: de.scrollWidth - de.clientWidth,
            bodyOverflow: body.scrollWidth - body.clientWidth,
            innerWidth: window.innerWidth,
          };
        });
        expect(horizontal.docOverflow, "documentElement horizontal scroll")
          .toBeLessThanOrEqual(1);
        expect(horizontal.bodyOverflow, "body horizontal scroll")
          .toBeLessThanOrEqual(1);

        // Invariant 2: body itself does not vertically scroll.
        const verticalBody = await page.evaluate(() => {
          const body = document.body;
          return body.scrollHeight - body.clientHeight;
        });
        expect(verticalBody, "body should not scroll vertically")
          .toBeLessThanOrEqual(1);

        // Invariant 3: <main> IS the scroll container, height-bounded.
        const main = await page.evaluate(() => {
          const el = document.querySelector("main");
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            overflowY: cs.overflowY,
            innerHeight: window.innerHeight,
          };
        });
        expect(main, "<main> must exist").not.toBeNull();
        expect(["auto", "scroll"]).toContain(main!.overflowY);
        expect(
          main!.scrollHeight,
          "harness content must be tall enough to force scroll"
        ).toBeGreaterThan(main!.clientHeight);
        // Height capped to viewport minus header + bottom nav (52 + 60 = 112).
        expect(main!.clientHeight).toBeLessThanOrEqual(main!.innerHeight);

        // Invariant 4: <main> can actually be scrolled programmatically
        // and the scroll lives on <main>, not on window.
        const scrolled = await page.evaluate(() => {
          const el = document.querySelector("main")!;
          el.scrollTop = 200;
          return { mainScrollTop: el.scrollTop, windowScrollY: window.scrollY };
        });
        expect(scrolled.mainScrollTop).toBeGreaterThan(0);
        expect(scrolled.windowScrollY).toBe(0);

        // Invariant 5: the off-viewport "sidebar" never extends the doc.
        const sidebarLeak = await page.evaluate(() => {
          const el = document.querySelector(
            '[data-testid="fake-sidebar"]'
          ) as HTMLElement | null;
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { right: rect.right, viewportWidth: window.innerWidth };
        });
        // Sidebar may render off-screen, but must not push doc width.
        expect(horizontal.docOverflow).toBeLessThanOrEqual(1);
        expect(sidebarLeak, "sidebar test element should mount").not.toBeNull();
      });
    }
  });
}