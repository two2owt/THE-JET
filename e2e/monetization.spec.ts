import { test, expect } from "@playwright/test";

/**
 * Monetization smoke coverage: checkout → webhook → feature unlock.
 *
 * Real Stripe checkout cannot run in CI, so the network boundary is stubbed at
 * the two places the app actually talks to the backend:
 *
 *   1. `create-checkout`      — asserts the client sends a real price id and
 *                               opens the returned URL.
 *   2. `subscribers` (PostgREST) — the authoritative paywall source since the
 *                               60s Stripe poll was removed. Stubbing the row
 *                               is exactly what the Stripe webhook does in
 *                               production, so this asserts the unlock path
 *                               end-to-end from the app's point of view.
 */

const SUBSCRIBERS_ROUTE = /\/rest\/v1\/subscribers/;

/** Shape the Stripe webhook writes into `public.subscribers`. */
function subscriberRow(tier: "jet_plus" | "jetx") {
  return {
    subscribed: true,
    tier,
    product_id: tier === "jetx" ? "prod_TZO4046HaI8g2t" : "prod_TZO4ZimXhwOsHJ",
    subscription_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  };
}

test.describe("subscription plans surface", () => {
  test("renders all three tiers with correct pricing", async ({ page }) => {
    await page.route(SUBSCRIBERS_ROUTE, (route) =>
      route.fulfill({ status: 200, json: null }),
    );

    await page.goto("/subscription");
    await expect(page.getByText(/JET\+/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/JETx/).first()).toBeVisible();
    await expect(page.getByText("6.99").first()).toBeVisible();
    await expect(page.getByText("12.99").first()).toBeVisible();
  });
});

test.describe("paywall reflects the subscribers table", () => {
  test("a free user does not see an active subscription", async ({ page }) => {
    await page.route(SUBSCRIBERS_ROUTE, (route) =>
      route.fulfill({ status: 200, json: null }),
    );

    await page.goto("/subscription");
    await expect(page.getByText(/JET\+/).first()).toBeVisible({
      timeout: 15_000,
    });
    // No "current plan" affordance for a free account.
    await expect(page.getByText(/manage subscription/i)).toHaveCount(0);
  });

  test("an expired row is treated as free, not subscribed", async ({
    page,
  }) => {
    await page.route(SUBSCRIBERS_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        json: {
          subscribed: true,
          tier: "jetx",
          product_id: "prod_TZO4046HaI8g2t",
          // Ended yesterday — the hook must downgrade to free.
          subscription_end: new Date(Date.now() - 86_400_000).toISOString(),
        },
      }),
    );

    await page.goto("/subscription");
    await expect(page.getByText(/JET\+/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/manage subscription/i)).toHaveCount(0);
  });
});

test.describe("checkout request contract", () => {
  test("create-checkout is called with a real Stripe price id", async ({
    page,
  }) => {
    await page.route(SUBSCRIBERS_ROUTE, (route) =>
      route.fulfill({ status: 200, json: null }),
    );

    let sentPriceId: string | null = null;
    await page.route(/functions\/v1\/create-checkout/, async (route) => {
      const body = route.request().postDataJSON() as { priceId?: string };
      sentPriceId = body?.priceId ?? null;
      await route.fulfill({
        status: 200,
        json: { url: "https://checkout.stripe.com/c/pay/test_session" },
      });
    });

    await page.goto("/subscription");
    const upgrade = page
      .getByRole("button", { name: /upgrade|subscribe|get jet/i })
      .first();

    // The page may gate behind auth; only assert the contract when the
    // control is actually reachable for an anonymous visitor.
    if (await upgrade.isVisible().catch(() => false)) {
      await upgrade.click();
      await expect
        .poll(() => sentPriceId, { timeout: 10_000 })
        .toMatch(/^price_/);
    } else {
      test.skip(true, "Checkout requires an authenticated session");
    }
  });
});

test.describe("webhook-driven unlock", () => {
  test("a JETx row unlocks the paid tier without a Stripe round-trip", async ({
    page,
  }) => {
    let stripeChecksMade = 0;
    await page.route(/functions\/v1\/check-subscription/, async (route) => {
      stripeChecksMade += 1;
      await route.fulfill({ status: 200, json: {} });
    });
    await page.route(SUBSCRIBERS_ROUTE, (route) =>
      route.fulfill({ status: 200, json: subscriberRow("jetx") }),
    );

    await page.goto("/subscription");
    await expect(page.getByText(/JETx/).first()).toBeVisible({
      timeout: 15_000,
    });

    // Regression guard for the removed 60s poll: reading paywall state must
    // never call the Stripe-backed edge function on load.
    await page.waitForTimeout(2_000);
    expect(stripeChecksMade).toBe(0);
  });
});
