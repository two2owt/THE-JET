import { test, expect } from "@playwright/test";

/**
 * Monetization smoke coverage.
 *
 * Real Stripe checkout cannot run in CI, and the plan picker lives behind the
 * authenticated profile settings panel — so this suite covers the parts that
 * are observable without a session:
 *
 *   1. The paywall surface is reachable and gates correctly for anonymous
 *      visitors (they are sent to auth rather than shown a broken screen).
 *   2. The regression guard for the removed 60s Stripe poll: no page load may
 *      call the `check-subscription` edge function. Paywall state now comes
 *      from `public.subscribers` plus a realtime subscription, and a
 *      reintroduced poll would show up here immediately.
 *
 * The webhook → unlock state derivation itself is unit-tested in
 * `src/test/subscription-state.test.ts`, which does not need a browser.
 */

const PUBLIC_ROUTES = ["/", "/favorites", "/social", "/messages"] as const;

test.describe("no Stripe polling on load", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} never calls check-subscription`, async ({ page }) => {
      let stripeChecks = 0;
      await page.route(/functions\/v1\/check-subscription/, async (r) => {
        stripeChecks += 1;
        await r.fulfill({ status: 200, json: {} });
      });

      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      // Generous window: the old implementation fired immediately on mount and
      // then every 60s, so an immediate call is what we're guarding against.
      await page.waitForTimeout(3_000);

      expect(
        stripeChecks,
        "paywall state must be read from the subscribers table, not polled from Stripe",
      ).toBe(0);
    });
  }
});

test.describe("paywall gating for anonymous visitors", () => {
  test("profile settings redirect to auth instead of erroring", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForLoadState("domcontentloaded");

    // Either the auth screen took over, or the profile shell rendered a
    // signed-out state. Both are acceptable; a crash is not.
    const onAuth = /\/(auth|signin)/.test(new URL(page.url()).pathname);
    if (!onAuth) {
      await expect(page.locator("body")).not.toContainText(
        /something went wrong/i,
      );
    }
  });
});

test.describe("app shell smoke", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders without a client crash`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).toBeVisible();
      expect(pageErrors, `client errors on ${route}`).toEqual([]);
    });
  }
});
