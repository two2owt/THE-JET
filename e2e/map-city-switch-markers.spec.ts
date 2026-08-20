import { test, expect, type Page } from "@playwright/test";

/**
 * City-switch marker integration coverage.
 *
 * Verifies the reconciliation contract in `MapboxHeatmap.updateMarkers`:
 *   - venue markers render for the initial city,
 *   - switching cities rebuilds the field after the fly-to `moveend` settles,
 *   - no venue id is ever rendered twice (keyed reconciliation, no duplicates),
 *   - zooming below `CLUSTER_MAX_ZOOM` collapses pins into cluster bubbles and
 *     zooming back in re-expands them.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const VENUE = ".venue-marker";
const CLUSTER = ".venue-cluster-marker";

async function venueIds(page: Page): Promise<string[]> {
  return page.$$eval(VENUE, (els) =>
    els.map((el) => (el as HTMLElement).dataset.venueId ?? ""),
  );
}

/** Wait until the marker field stops changing for two consecutive samples. */
async function waitForStableMarkers(page: Page, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let previous = "";
  while (Date.now() < deadline) {
    const ids = (await venueIds(page)).sort().join(",");
    if (ids && ids === previous) return ids.split(",");
    previous = ids;
    await page.waitForTimeout(1200);
  }
  throw new Error("venue markers never settled");
}

async function selectCity(page: Page, label: RegExp) {
  await page.getByLabel("Select city location").click();
  await page.getByRole("option", { name: label }).first().click();
}

test("switching cities re-renders venue markers without duplicates", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("jet-map-selected-city", "charlotte");
  });
  await page.goto("/");

  await expect(page.getByLabel("Select city location")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForSelector(VENUE, { timeout: 60_000 });

  const before = await waitForStableMarkers(page);
  expect(before.length).toBeGreaterThan(0);
  expect(new Set(before).size).toBe(before.length);

  await selectCity(page, /Chicago/i);

  // The fly-to lasts 2s; markers are rebuilt on `moveend`.
  await page.waitForTimeout(3000);
  const after = await waitForStableMarkers(page);

  expect(after.length).toBeGreaterThan(0);
  // No duplicated pins after the swap (keyed reconciliation).
  expect(new Set(after).size).toBe(after.length);
  // The field actually changed cities.
  expect(after.join(",")).not.toBe(before.join(","));
});

test("zooming out collapses markers into clusters and back", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Select city location")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForSelector(VENUE, { timeout: 60_000 });
  await waitForStableMarkers(page);

  // Wheel-zoom over the map centre: clicking the canvas is unreliable because
  // floating map controls sit above it and intercept pointer events.
  const box = await page.locator(".mapboxgl-canvas").first().boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 800) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 600) / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
  }

  await expect
    .poll(async () => page.locator(CLUSTER).count(), { timeout: 30_000 })
    .toBeGreaterThan(0);

  // Zoom back past CLUSTER_MAX_ZOOM; wheel-in steps are smaller than
  // wheel-out steps in Mapbox, so use more of them.
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(250);
  }

  // Individual pins come back and the cluster bubbles are reconciled away.
  await expect
    .poll(async () => page.locator(VENUE).count(), { timeout: 45_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => page.locator(CLUSTER).count(), { timeout: 45_000 })
    .toBe(0);
});
