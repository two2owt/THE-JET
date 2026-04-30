import { test, expect, type Route } from "@playwright/test";

/**
 * E2E tests for the AccountSection (email + password updates).
 *
 * Strategy: mount the section in isolation at /dev/account-test and
 * intercept Supabase's `PUT /auth/v1/user` endpoint (called internally by
 * `supabase.auth.updateUser`) so we can drive deterministic success and
 * failure scenarios without a real backend session.
 */

const HARNESS_URL = "/dev/account-test";
const SUPABASE_USER_ENDPOINT = /\/auth\/v1\/user(\?.*)?$/;

type UpdateUserCall = {
  method: string;
  body: Record<string, unknown>;
  url: string;
};

/**
 * Install a route handler that records every PUT to /auth/v1/user and
 * responds with the configured status + body. Returns the captured call
 * list so tests can assert on what supabase-js was about to send.
 */
async function mockUpdateUser(
  page: import("@playwright/test").Page,
  responder: (call: UpdateUserCall) => { status: number; body: unknown }
) {
  const calls: UpdateUserCall[] = [];

  await page.route(SUPABASE_USER_ENDPOINT, async (route: Route) => {
    const req = route.request();
    if (req.method() !== "PUT") {
      // Let GETs (session check) pass through-ish with a minimal stub
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          email: "current@example.com",
          aud: "authenticated",
          role: "authenticated",
        }),
      });
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(req.postData() ?? "{}");
    } catch {
      body = {};
    }
    const call: UpdateUserCall = { method: req.method(), body, url: req.url() };
    calls.push(call);

    const { status, body: respBody } = responder(call);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(respBody),
    });
  });

  return calls;
}

test.describe("AccountSection — Email update", () => {
  test("invalid email shows inline error and never calls Supabase", async ({ page }) => {
    const calls = await mockUpdateUser(page, () => ({
      status: 200,
      body: { user: { id: "x", email: "x" } },
    }));

    await page.goto(HARNESS_URL);

    const emailInput = page.getByLabel(/email address/i);
    await emailInput.fill("not-an-email");
    await page.getByRole("button", { name: /change email/i }).click();

    const error = page.getByRole("alert").first();
    await expect(error).toContainText(/valid email/i);
    await expect(emailInput).toHaveAttribute("aria-invalid", "true");

    // Give any in-flight request time to *not* arrive
    await page.waitForTimeout(250);
    expect(calls).toHaveLength(0);
  });

  test("valid email calls updateUser with redirect and shows success toast", async ({ page }) => {
    const calls = await mockUpdateUser(page, () => ({
      status: 200,
      body: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "current@example.com",
        new_email: "fresh@example.com",
        email_change_sent_at: new Date().toISOString(),
      },
    }));

    await page.goto(HARNESS_URL);

    await page.getByLabel(/email address/i).fill("fresh@example.com");
    await page.getByRole("button", { name: /change email/i }).click();

    // Sonner toast: "Confirmation email sent"
    await expect(page.getByText(/confirmation email sent/i)).toBeVisible();

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ email: "fresh@example.com" });
    // Supabase appends ?redirect_to=... to the URL for emailRedirectTo
    expect(calls[0].url).toContain("redirect_to");
    expect(decodeURIComponent(calls[0].url)).toContain("/verification-success");
  });

  test("server error surfaces inline and as toast", async ({ page }) => {
    await mockUpdateUser(page, () => ({
      status: 422,
      body: { code: 422, msg: "Email rate limit exceeded" },
    }));

    await page.goto(HARNESS_URL);

    await page.getByLabel(/email address/i).fill("fresh@example.com");
    await page.getByRole("button", { name: /change email/i }).click();

    await expect(page.getByRole("alert").first()).toContainText(/rate limit/i);
    await expect(page.getByText(/couldn't update email/i)).toBeVisible();
  });
});

test.describe("AccountSection — Password update", () => {
  test("weak password shows inline error and never calls Supabase", async ({ page }) => {
    const calls = await mockUpdateUser(page, () => ({
      status: 200,
      body: { user: { id: "x" } },
    }));

    await page.goto(HARNESS_URL);

    await page.getByLabel(/^new password$/i).fill("Short1");
    await page.getByLabel(/confirm new password/i).fill("Short1");
    await page.getByRole("button", { name: /update password/i }).click();

    await expect(
      page.getByText(/at least 8 characters/i).first()
    ).toBeVisible();

    await page.waitForTimeout(250);
    expect(calls).toHaveLength(0);
  });

  test("mismatched confirmation shows inline error", async ({ page }) => {
    const calls = await mockUpdateUser(page, () => ({
      status: 200,
      body: { user: { id: "x" } },
    }));

    await page.goto(HARNESS_URL);

    await page.getByLabel(/^new password$/i).fill("ValidPass1");
    await page.getByLabel(/confirm new password/i).fill("DifferentPass1");
    await page.getByRole("button", { name: /update password/i }).click();

    await expect(page.getByText(/don't match/i)).toBeVisible();
    await page.waitForTimeout(250);
    expect(calls).toHaveLength(0);
  });

  test("valid password calls updateUser({ password }) and shows success toast", async ({ page }) => {
    const calls = await mockUpdateUser(page, () => ({
      status: 200,
      body: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "current@example.com",
      },
    }));

    await page.goto(HARNESS_URL);

    await page.getByLabel(/^new password$/i).fill("ValidPass1");
    await page.getByLabel(/confirm new password/i).fill("ValidPass1");
    await page.getByRole("button", { name: /update password/i }).click();

    await expect(page.getByText(/password updated/i)).toBeVisible();

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ password: "ValidPass1" });
    // Should NOT include email when only changing password
    expect(calls[0].body).not.toHaveProperty("email");
  });

  test("server error surfaces inline and as toast", async ({ page }) => {
    await mockUpdateUser(page, () => ({
      status: 422,
      body: { code: 422, msg: "New password should be different from the old password" },
    }));

    await page.goto(HARNESS_URL);

    await page.getByLabel(/^new password$/i).fill("ValidPass1");
    await page.getByLabel(/confirm new password/i).fill("ValidPass1");
    await page.getByRole("button", { name: /update password/i }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /should be different/i })
    ).toBeVisible();
    await expect(page.getByText(/couldn't update password/i)).toBeVisible();
  });
});