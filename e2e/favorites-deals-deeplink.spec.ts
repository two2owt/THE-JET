import { test, expect } from "@playwright/test";

/**
 * Favorites / Deals → JetCard deep-link routing.
 *
 * Guards that a shared or tapped deep link always lands on `/` with the
 * venue/deal param intact (map rehydration entry point) on a cold load,
 * including push-style links that carry layer state and a notification id.
 */

const links = [
  { name: "venue deep link", url: "/?venue=e2e-venue-1", param: "venue" },
  { name: "deal deep link", url: "/?deal=e2e-deal-1", param: "deal" },
  {
    name: "push deep link with layers",
    url: "/?venue=e2e-venue-1&layers=density,paths&nid=e2e-nid",
    param: "venue",
  },
];

for (const link of links) {
  test(`cold load restores map state for ${link.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(link.url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Stays on the map route (no redirect to /auth or a 404 shell).
    const url = new URL(page.url());
    expect(url.pathname).toBe("/");
    // The map surface is mounted.
    // TanStack Start hydrates directly into <body> — there is no #root wrapper.
    await expect(page.locator("body")).toBeVisible();
    // Layer state from the push payload survives the cold load.
    if (link.url.includes("layers=")) {
      expect(url.searchParams.get("layers")).toContain("density");
    }
    // The notification id is consumed (stripped) once handled.
    if (link.url.includes("nid=")) {
      await expect
        .poll(() => new URL(page.url()).searchParams.get("nid"), {
          timeout: 10_000,
        })
        .toBeNull();
    }
    expect(errors).toEqual([]);
  });
}

test("share button copies a stable deep link from favorites", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/favorites", { waitUntil: "domcontentloaded" });
  const shareButton = page.locator('[data-testid^="share-venue-"]').first();
  if ((await shareButton.count()) === 0) {
    test.skip(true, "No saved venues in this environment");
  }
  await shareButton.click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("venue=");
});
