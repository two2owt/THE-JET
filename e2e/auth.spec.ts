import { test, expect } from "@playwright/test";

/**
 * Auth flow coverage for /auth, /signin, /signup.
 *
 * These tests exercise the UI only — no real Supabase mutations. They verify
 * route → mode mapping, validation, mode switching, password visibility
 * toggle, forgot-password navigation, and reset-password rendering when
 * arriving with `?reset=true` (without a valid session a toast is shown).
 */

const ROUTES = ["/auth", "/signin", "/signup"] as const;

test.describe("auth routes render the correct mode", () => {
  test("/auth defaults to sign-in", async ({ page }) => {
    await page.goto("/auth");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/sign in to jet/i);
  });

  test("/signin renders sign-in mode", async ({ page }) => {
    await page.goto("/signin");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });

  test("/signup renders create-account mode", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/create your jet account/i);
    // Signup-only fields are visible.
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(page.getByLabel(/privacy policy/i)).toBeVisible();
    await expect(page.getByLabel(/location tracking/i)).toBeVisible();
  });
});

test.describe("mode switching via the footer link", () => {
  test("sign-in → sign-up updates URL and heading", async ({ page }) => {
    await page.goto("/signin");
    await page.getByTestId("auth-mode-switch").click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
  });

  test("sign-up → sign-in updates URL and heading", async ({ page }) => {
    await page.goto("/signup");
    await page.getByTestId("auth-mode-switch").click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });
});

test.describe("sign-in form", () => {
  test("invalid email surfaces inline validation", async ({ page }) => {
    await page.goto("/signin");
    // HTML5 `required` blocks empty submits, so feed an invalid email to
    // exercise the zod validation path.
    await page.locator("#auth-email").fill("not-an-email");
    await page.locator("#auth-password").fill("anything");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#auth-email-error")).toBeVisible();
    await expect(page.locator("#auth-email-error")).toContainText(
      /valid email address/i,
    );
  });

  test("password show/hide toggle flips input type", async ({ page }) => {
    await page.goto("/signin");
    const pw = page.locator("#auth-password");
    await pw.fill("Hunter22A");
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).click();
    await expect(pw).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(pw).toHaveAttribute("type", "password");
  });
});

test.describe("sign-up form", () => {
  test("weak password shows the strength hint as an error", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#auth-email").fill("test@example.com");
    await page.locator("#auth-password").fill("weak");
    await page.locator("#auth-confirm-password").fill("weak");
    await page.locator("form button[type=submit]").click();
    await expect(
      page.getByText(/at least 8 characters|uppercase letter|number/i).first(),
    ).toBeVisible();
  });

  test("mismatched confirm password surfaces an error", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#auth-email").fill("test@example.com");
    await page.locator("#auth-password").fill("StrongPass1");
    await page.locator("#auth-confirm-password").fill("StrongPass2");
    await page.locator("#auth-confirm-password").blur();
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#auth-confirm-password-error")).toBeVisible();
    await expect(page.locator("#auth-confirm-password-error")).toContainText(
      /passwords do not match/i,
    );
  });

  test("submitting without consent boxes blocks submission", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#auth-email").fill("test@example.com");
    await page.locator("#auth-password").fill("StrongPass1");
    await page.locator("#auth-confirm-password").fill("StrongPass1");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#auth-consent-error")).toBeVisible();
    await expect(page.locator("#auth-consent-error")).toContainText(
      /privacy policy and terms of service/i,
    );
  });
});

test.describe("forgot-password flow", () => {
  test("`Forgot?` link reveals the forgot-password screen", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /forgot\?/i }).click();
    await expect(
      page.getByRole("heading", { name: /reset password/i }),
    ).toBeVisible();
    // Password field is hidden in forgot mode.
    await expect(page.locator("#auth-password")).toHaveCount(0);
    // Back link returns to sign-in.
    await page.getByRole("button", { name: /back to sign in/i }).click();
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });

  test("submitting an invalid email blocks the request", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /forgot\?/i }).click();
    await page.locator("#auth-email").fill("not-an-email");
    await page.locator("form button[type=submit]").click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
  });
});

test.describe("reset-password flow", () => {
  test("`/auth?reset=true` without session falls back to sign-in", async ({
    page,
  }) => {
    await page.goto("/auth?reset=true");
    // No valid recovery session → app stays on the sign-in screen and a
    // toast (sonner) explains the link is invalid/expired.
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });
});

test.describe("SEO metadata per route", () => {
  for (const route of ROUTES) {
    test(`canonical link is set on ${route}`, async ({ page }) => {
      await page.goto(route);
      const href = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      expect(href).toBeTruthy();
    });
  }
});