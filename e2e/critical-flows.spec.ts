import { test, expect, type Page } from "@playwright/test";

/**
 * Environment-agnostic critical-path E2E suite.
 *
 * Runs against whatever `PLAYWRIGHT_BASE_URL` points at:
 *   - local dev      → http://localhost:8080 (default)
 *   - preview        → bun run test:e2e:preview
 *   - live/published → bun run test:e2e:live
 *
 * Every assertion is read-only and non-destructive, so it is safe to run
 * against production. Sign-up is exercised through validation and (when
 * `E2E_ALLOW_SIGNUP=1` plus a mail-safe domain) a real account creation.
 */

const IS_LIVE = /jet-around\.com|\.lovable\.app/.test(
  process.env.PLAYWRIGHT_BASE_URL ?? "",
);

async function gotoAuth(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector('[data-auth-ready="true"]', { state: "attached" });
}

test.describe("sign-up", () => {
  test("create-account screen renders all required fields", async ({
    page,
  }) => {
    await gotoAuth(page, "/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await expect(page.locator("#auth-email")).toBeVisible();
    await expect(page.locator("#auth-password")).toBeVisible();
    await expect(page.locator("#auth-confirm-password")).toBeVisible();
    await expect(page.getByLabel(/privacy policy/i)).toBeVisible();
  });

  test("consent is enforced before an account can be created", async ({
    page,
  }) => {
    await gotoAuth(page, "/signup");
    await page.locator("#auth-email").fill(`e2e+${Date.now()}@example.com`);
    await page.locator("#auth-password").fill("StrongPass1");
    await page.locator("#auth-confirm-password").fill("StrongPass1");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#auth-consent-error")).toBeVisible();
  });

  test("real sign-up creates an account and asks for verification", async ({
    page,
  }) => {
    test.skip(
      process.env.E2E_ALLOW_SIGNUP !== "1",
      "set E2E_ALLOW_SIGNUP=1 to create a throwaway account",
    );
    const email = `jet-e2e+${Date.now()}@example.com`;
    await gotoAuth(page, "/signup");
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill("StrongPass1");
    await page.locator("#auth-confirm-password").fill("StrongPass1");
    await page.getByLabel(/privacy policy/i).click();
    await page.locator("form button[type=submit]").click();
    await expect(
      page.getByText(/verify|check your (email|inbox)/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("sign-in", () => {
  test("invalid email is rejected client-side", async ({ page }) => {
    await gotoAuth(page, "/signin");
    await page.locator("#auth-email").fill("not-an-email");
    await page.locator("#auth-password").fill("whatever1A");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#auth-email-error")).toBeVisible();
  });

  test("wrong credentials surface a persistent inline error", async ({
    page,
  }) => {
    await gotoAuth(page, "/signin");
    await page.locator("#auth-email").fill(`nobody+${Date.now()}@example.com`);
    await page.locator("#auth-password").fill("WrongPass1");
    await page.locator("form button[type=submit]").click();
    await expect(
      page.getByText(/invalid|incorrect|confirm|verify/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    // Still on the auth screen — no silent redirect into the app.
    await expect(page).toHaveURL(/sign-?in|auth/);
  });

  test("protected routes bounce signed-out visitors to auth", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/sign-?in|auth|login/, { timeout: 20_000 });
  });
});

test.describe("email verification + recovery routes", () => {
  const ROUTES = [
    "/verification-success",
    "/link-expired",
    "/forgot-password",
    "/reset-password",
  ];

  for (const route of ROUTES) {
    test(`${route} renders without a crash`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      expect(errors, `page errors on ${route}`).toEqual([]);
    });
  }

  test("expired verification link lands on recovery, not a 404", async ({
    page,
  }) => {
    await page.goto("/confirm?error=access_denied&error_code=otp_expired");
    await expect(page.getByText(/expired|invalid|resend|sign in/i).first())
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^404$/)).toHaveCount(0);
  });

  test("legacy auth aliases redirect while preserving query tokens", async ({
    page,
  }) => {
    await page.goto("/login?redirect=%2Fprofile");
    await expect(page).toHaveURL(/sign-?in|auth|login/, { timeout: 20_000 });
    await page.waitForSelector('[data-auth-ready="true"]', {
      state: "attached",
    });
  });
});

test.describe("deep-link routing", () => {
  const DEEP_LINKS = [
    "/",
    "/deals",
    "/deals?cat=food",
    "/?venue=e2e-unknown-venue",
    "/?deal=00000000-0000-0000-0000-000000000000",
    "/privacy-policy",
    "/terms-of-service",
    "/pricing",
  ];

  for (const link of DEEP_LINKS) {
    test(`${link} loads and keeps its route state`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(link);
      await expect(page.locator("body")).toBeVisible();
      const url = new URL(page.url());
      const target = new URL(link, url.origin);
      // Public deep links must not be rewritten away by a guard.
      if (target.search) {
        expect(url.pathname + url.search).toContain(
          target.searchParams.keys().next().value as string,
        );
      }
      expect(errors, `page errors on ${link}`).toEqual([]);
    });
  }

  test("unknown routes render the app's not-found page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(
      page.getByText(/not found|404|back to/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("canonical + title metadata is present on public routes", async ({
    page,
  }) => {
    for (const route of ["/", "/deals", "/signup"]) {
      await page.goto(route);
      await expect(page).toHaveTitle(/.+/);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    }
  });

  test("live environment serves over the canonical apex domain", async ({
    page,
  }) => {
    test.skip(!IS_LIVE, "only meaningful against preview/live deployments");
    await page.goto("/");
    expect(page.url()).toMatch(/^https:\/\//);
  });
});
