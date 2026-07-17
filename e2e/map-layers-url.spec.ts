import { test, expect, type Page } from "@playwright/test";

// Mapbox + WebGL is expensive; running six map tests concurrently under
// software WebGL (sandbox / CI) reliably starves them past the 20s UI
// wait. Serialize this file and give each test a bit more runway.
test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

/**
 * End-to-end coverage for `?layers=` URL parsing and toggle-UI sync.
 *
 * These tests drive the real MapboxHeatmap container by editing the URL
 * query directly and asserting that:
 *   - localStorage persistence agrees with what the URL requested,
 *   - the collapsed-panel quick-toggle chips reflect the same state
 *     (`aria-pressed`, `aria-label` "Hide …" vs "Show …"),
 *   - the URL is rewritten to its canonical form after mount,
 *   - a full page refresh preserves the resolved state.
 *
 * Hardening scenarios cover unknown tokens, reordered tokens, duplicates,
 * mixed case, and repeated `?layers=` occurrences — the exact adversarial
 * inputs the unit tests in
 * `src/components/map/__tests__/layerPersistence.test.ts` lock in for
 * `parseLayersParam` / `serializeLayersParam`.
 */

const DENSITY_KEY = "jet-map-layer-density";
const PATHS_KEY = "jet-map-layer-paths";

/**
 * Wait for the map container to mount enough to render the FAB row +
 * quick-toggle chips (which live in collapsed-panel state, the default).
 * We do NOT wait for Mapbox tiles — those need network + a live token and
 * aren't necessary to verify URL/state sync.
 */
async function waitForLayersUi(page: Page) {
  await expect(
    page.getByRole("button", { name: /open layers panel/i }),
  ).toBeVisible({ timeout: 20_000 });
}

function heatmapChip(page: Page) {
  return page.getByRole("button", { name: /(show|hide) heatmap layer/i });
}

function pathsChip(page: Page) {
  return page.getByRole("button", { name: /(show|hide) flow paths layer/i });
}

async function readStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

async function currentLayersParam(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    new URLSearchParams(window.location.search).get("layers"),
  );
}

/**
 * Clear the two persisted layer keys so each test starts from a known
 * "nothing persisted" baseline. We navigate to the origin first so
 * localStorage is scoped to the app.
 */
async function resetPersistence(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("jet-map-layer-density");
    window.localStorage.removeItem("jet-map-layer-paths");
    window.localStorage.removeItem("jet-map-layer-parking");
    window.localStorage.removeItem("jet-map-layer-stats");
  });
}

test.describe("?layers= URL param drives layer state and stays in sync", () => {
  test.beforeEach(async ({ page }) => {
    await resetPersistence(page);
  });

  test("reordered tokens enable both layers and are rewritten to canonical order", async ({
    page,
  }) => {
    await page.goto("/?layers=paths,density");
    await waitForLayersUi(page);

    // Storage reflects the URL request.
    await expect
      .poll(() => readStorage(page, DENSITY_KEY))
      .toBe("true");
    await expect
      .poll(() => readStorage(page, PATHS_KEY))
      .toBe("true");

    // Chip UI reflects the same state.
    await expect(heatmapChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect(pathsChip(page)).toHaveAttribute("aria-pressed", "true");

    // URL was normalized to canonical order (density,paths).
    await expect.poll(() => currentLayersParam(page)).toBe("density,paths");
  });

  test("unknown tokens are ignored without polluting other toggles", async ({
    page,
  }) => {
    await page.goto("/?layers=bogus,foo,bar");
    await waitForLayersUi(page);

    await expect(heatmapChip(page)).toHaveAttribute("aria-pressed", "false");
    await expect(pathsChip(page)).toHaveAttribute("aria-pressed", "false");

    // Canonical form of "no known layers" is a stripped `layers` param.
    await expect.poll(() => currentLayersParam(page)).toBeNull();
  });

  test("mixed-case + duplicate + unknown tokens resolve cleanly", async ({
    page,
  }) => {
    await page.goto("/?layers=DENSITY,foo,PATHS,paths,density");
    await waitForLayersUi(page);

    await expect(heatmapChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect(pathsChip(page)).toHaveAttribute("aria-pressed", "true");

    await expect
      .poll(() => readStorage(page, DENSITY_KEY))
      .toBe("true");
    await expect
      .poll(() => readStorage(page, PATHS_KEY))
      .toBe("true");

    await expect.poll(() => currentLayersParam(page)).toBe("density,paths");
  });

  test("repeated ?layers= occurrences are merged", async ({ page }) => {
    await page.goto("/?layers=density&layers=paths");
    await waitForLayersUi(page);

    await expect(heatmapChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect(pathsChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => currentLayersParam(page)).toBe("density,paths");
  });

  test("resolved state survives a full page refresh", async ({ page }) => {
    await page.goto("/?layers=paths,foo,DENSITY");
    await waitForLayersUi(page);
    await expect
      .poll(() => readStorage(page, DENSITY_KEY))
      .toBe("true");
    await expect
      .poll(() => readStorage(page, PATHS_KEY))
      .toBe("true");

    // Refresh — the canonical URL + storage should reproduce the same UI.
    await page.reload();
    await waitForLayersUi(page);

    await expect(heatmapChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect(pathsChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => currentLayersParam(page)).toBe("density,paths");
  });

  test("URL param wins over stale localStorage on load", async ({ page }) => {
    // Seed storage as if the user had both layers on previously.
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.setItem("jet-map-layer-density", "true");
      window.localStorage.setItem("jet-map-layer-paths", "true");
    });

    // Now deep-link with only density: paths should stay whatever storage
    // said (true) — omission is "no opinion", not "force off".
    await page.goto("/?layers=density");
    await waitForLayersUi(page);

    await expect(heatmapChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect(pathsChip(page)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => currentLayersParam(page)).toBe("density,paths");
  });
});