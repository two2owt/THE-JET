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

  // Use the Mapbox NavigationControl buttons: each click is a deterministic
  // one-zoom-level step, unlike wheel deltas.
  const zoomOut = page.locator(".mapboxgl-ctrl-zoom-out").first();
  const zoomIn = page.locator(".mapboxgl-ctrl-zoom-in").first();

  for (let i = 0; i < 6; i++) {
    await zoomOut.click({ force: true });
    await page.waitForTimeout(500);
    if ((await page.locator(CLUSTER).count()) > 0) break;
  }
  // Below CLUSTER_MAX_ZOOM (13) pins collapse into cluster bubbles.
  expect(await page.locator(CLUSTER).count()).toBeGreaterThan(0);

  for (let i = 0; i < 8; i++) {
    await zoomIn.click({ force: true });
    await page.waitForTimeout(500);
    if ((await page.locator(CLUSTER).count()) === 0) break;
  }

  // Clusters are reconciled away and individual pins render again.
  await expect
    .poll(async () => page.locator(CLUSTER).count(), { timeout: 30_000 })
    .toBe(0);
  const ids = await waitForStableMarkers(page);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
});
