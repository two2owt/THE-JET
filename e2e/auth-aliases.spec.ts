import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke coverage for every commonly-landed auth URL.
 *
 * These paths are what real reset/verification emails, old bookmarks, and
 * guessed URLs point at. The regression we're guarding against is twofold:
 *   1. the path renders the app's not-found screen (the reported "404"), and
 *   2. an alias forwards to the canonical route but DROPS the Supabase token
 *      hash on the way, so the user lands signed-out on a form they can't use.
 *
 * No real Supabase mutation happens — the tokens are syntactically valid dummy
 * values, which is enough to assert they survive the redirect.
 */

/** Aliases that should end up on the canonical route, hash intact. */
const ALIASES: Array<{ from: string; expect: RegExp }> = [
  { from: "/login", expect: /\/signin$/ },
  { from: "/sign-in", expect: /\/signin$/ },
  { from: "/register", expect: /\/signup$/ },
  { from: "/sign-up", expect: /\/signup$/ },
  { from: "/forgot-password", expect: /\/(auth|signin)/ },
  { from: "/reset", expect: /\/reset-password/ },
  { from: "/update-password", expect: /\/reset-password/ },
  { from: "/auth/reset", expect: /\/reset-password/ },
  { from: "/auth/reset-password", expect: /\/reset-password/ },
  { from: "/verify", expect: /\/(verification-success|auth|signin)/ },
  { from: "/confirm", expect: /\/(verification-success|auth|signin)/ },
  { from: "/auth/confirm", expect: /\/(verification-success|auth|signin)/ },
  { from: "/auth/verify", expect: /\/(verification-success|auth|signin)/ },
  { from: "/email-confirmed", expect: /\/(verification-success|auth|signin)/ },
  { from: "/auth/callback", expect: /\/(auth|signin|onboarding|\/)/ },
];

/** Canonical auth routes must render directly, never redirect into not-found. */
const CANONICAL = [
  "/auth",
  "/signin",
  "/signup",
  "/reset-password",
  "/verification-success",
  "/link-expired",
];

const NOT_FOUND = /page not found|404|couldn't find/i;

async function expectNotNotFound(page: Page) {
  await expect(page.locator("body")).not.toContainText(NOT_FOUND);
}

test.describe("auth alias paths resolve", () => {
  for (const alias of ALIASES) {
    test(`${alias.from} loads and forwards to a real auth route`, async ({
      page,
    }) => {
      const failures: string[] = [];
      page.on("pageerror", (e) => failures.push(e.message));

      await page.goto(alias.from);
      // Aliases forward via window.location.replace on mount.
      await page.waitForURL(alias.expect, { timeout: 15_000 });
      await expectNotNotFound(page);
      expect(failures, `page errors on ${alias.from}`).toEqual([]);
    });
  }
});

test.describe("canonical auth routes render", () => {
  for (const path of CANONICAL) {
    test(`${path} renders without a not-found screen`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);
      await expectNotNotFound(page);
    });
  }
});

/**
 * Recovery/confirmation tokens live in the URL hash. A server-side redirect
 * would silently drop them, so these assert the hash survives verbatim.
 */
const RECOVERY_HASH =
  "#access_token=dummy-access-token-value&refresh_token=dummy-refresh-token-value&expires_in=3600&token_type=bearer&type=recovery";

test.describe("hash-preserving redirects keep Supabase tokens", () => {
  for (const from of ["/update-password", "/reset", "/auth/reset"]) {
    test(`${from} preserves the recovery token hash`, async ({ page }) => {
      await page.goto(`${from}${RECOVERY_HASH}`);
      await page.waitForURL(/\/reset-password/, { timeout: 15_000 });

      const hash = await page.evaluate(() => window.location.hash);
      expect(hash).toContain("access_token=dummy-access-token-value");
      expect(hash).toContain("refresh_token=dummy-refresh-token-value");
      expect(hash).toContain("type=recovery");
    });
  }

  test("/auth/callback preserves the token hash", async ({ page }) => {
    await page.goto(`/auth/callback${RECOVERY_HASH}`);
    await page.waitForURL(/^(?!.*\/auth\/callback).*$/, { timeout: 15_000 });
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain("access_token=dummy-access-token-value");
  });

  test("alias query params are merged into the target URL", async ({ page }) => {
    await page.goto("/verify?token_hash=dummy-token-hash&type=signup");
    await page.waitForURL(/\/(verification-success|auth|signin)/, {
      timeout: 15_000,
    });
    const search = await page.evaluate(() => window.location.search);
    expect(search).toContain("token_hash=dummy-token-hash");
    expect(search).toContain("type=signup");
  });
});

test.describe("expired links land on the recovery screen", () => {
  test("an otp_expired recovery hash routes to /link-expired", async ({
    page,
  }) => {
    await page.goto(
      "/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    await page.waitForURL(/\/link-expired/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /reset link expired/i }),
    ).toBeVisible();
    await expect(page.getByTestId("link-expired-primary")).toBeVisible();
  });

  test("the signup flow offers a verification resend", async ({ page }) => {
    await page.goto("/link-expired?flow=signup&reason=otp_expired");
    await expect(
      page.getByRole("heading", { name: /verification link expired/i }),
    ).toBeVisible();
    await expect(page.getByTestId("link-expired-primary")).toContainText(
      /resend verification/i,
    );
  });
});

test.describe("auth redirect diagnostics", () => {
  test("alias hops are logged without leaking token values", async ({
    page,
  }) => {
    const logs: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("[auth-redirect]")) logs.push(msg.text());
    });
    const posted: string[] = [];
    await page.route("**/api/public/auth-redirect-log", async (route) => {
      posted.push(route.request().postData() ?? "");
      await route.fulfill({ status: 204, body: "" });
    });

    await page.goto(`/update-password${RECOVERY_HASH}`);
    await page.waitForURL(/\/reset-password/, { timeout: 15_000 });
    await page.waitForTimeout(500);

    const all = [...logs, ...posted].join("\n");
    expect(all, "a diagnostic was emitted").toContain("auth-redirect");
    // Token keys may be named; their VALUES must never appear.
    expect(all).not.toContain("dummy-access-token-value");
    expect(all).not.toContain("dummy-refresh-token-value");
  });
});
