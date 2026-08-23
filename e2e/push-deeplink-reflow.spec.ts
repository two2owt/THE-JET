import { test, expect, type Page } from "@playwright/test";

/**
 * Push-notification deep link → background → rotate → resume.
 *
 * Guards the useViewportReflow contract: after the app comes back to the
 * foreground the published --viewport-* variables must match the real
 * viewport immediately, with no residual scroll overflow (layout jump).
 */

const PUSH_DEEP_LINK = "/?deal=e2e-deal&layers=density,paths";

type ViewportState = {
  dvh: number;
  svh: number;
  inner: number;
  orientation: string;
  overflowX: number;
  overflowY: number;
};

async function readState(page: Page): Promise<ViewportState> {
  return page.evaluate(
    () =>
      new Promise<ViewportState>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const root = document.documentElement;
            const num = (name: string) =>
              parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
            resolve({
              dvh: num("--viewport-dvh"),
              svh: num("--viewport-svh"),
              inner: window.innerHeight,
              orientation: root.dataset.orientation ?? "",
              overflowX: root.scrollWidth - window.innerWidth,
              overflowY: root.scrollHeight - window.innerHeight,
            });
          }),
        );
      }),
  );
}

async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => value,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test.describe("push deep link reflow on resume", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no layout jump after background + rotation", async ({ page }) => {
    await page.goto(PUSH_DEEP_LINK, { waitUntil: "domcontentloaded" });
    // Wait for hydration to publish the viewport variables instead of racing
    // a fixed timeout (slow CI machines hydrate well after 1.5s).
    await page.waitForFunction(
      () =>
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--viewport-dvh",
          ),
        ) > 0,
      undefined,
      { timeout: 20_000 },
    );

    const initial = await readState(page);
    expect(initial.dvh).toBeCloseTo(initial.inner, 0);
    expect(initial.orientation).toBe("portrait");
    // The layer state carried by the push payload survives the landing
    // (an unknown deal id is dropped by the app, which is expected).
    expect(decodeURIComponent(page.url())).toContain("layers=density,paths");

    // Background the app (user taps away / OS shows another app).
    await setVisibility(page, "hidden");
    // Device rotates while the app is hidden.
    await page.setViewportSize({ width: 844, height: 390 });
    // Resume — this is where a stale viewport would cause a jump.
    await setVisibility(page, "visible");

    const resumed = await readState(page);
    expect(resumed.inner).toBe(390);
    expect(resumed.dvh).toBeCloseTo(resumed.inner, 0);
    expect(resumed.svh).toBeLessThanOrEqual(resumed.inner + 1);
    expect(resumed.orientation).toBe("landscape");
    expect(resumed.overflowX).toBeLessThanOrEqual(0);

    // Settle: values must be stable a few frames later (no late jump).
    await page.waitForTimeout(400);
    const settled = await readState(page);
    expect(settled.dvh).toBe(resumed.dvh);
    expect(settled.inner).toBe(resumed.inner);
    expect(settled.orientation).toBe(resumed.orientation);
    expect(settled.overflowX).toBeLessThanOrEqual(0);

    // The flicker guard must not be left on after settling.
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains("is-reflowing"),
        ),
      )
      .toBe(false);

    // Rotating back restores the original geometry exactly.
    await setVisibility(page, "hidden");
    await page.setViewportSize({ width: 390, height: 844 });
    await setVisibility(page, "visible");
    const restored = await readState(page);
    expect(restored.inner).toBe(844);
    expect(restored.dvh).toBeCloseTo(844, 0);
    expect(restored.orientation).toBe("portrait");
    expect(restored.overflowX).toBeLessThanOrEqual(0);
  });
});
