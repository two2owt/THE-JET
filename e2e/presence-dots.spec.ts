import { test, expect, type Page } from "@playwright/test";

/**
 * Presence dot coverage.
 *
 * Presence buckets (green/yellow/red) are driven by configurable timing
 * thresholds in `src/lib/presenceConfig.ts`, exposed at runtime through
 * `window.__jetPresence`. The dev-only harness at `/dev/presence` renders the
 * same `PresenceDot` used by the header avatar and the social page avatars,
 * with stable user ids, so transitions can be asserted without a live session.
 */

const HARNESS = "/dev/presence";
const SELF_ID = "harness-self";
const FRIEND_ID = "harness-friend-1";

type Status = "active" | "recent" | "away";

async function gotoHarness(page: Page) {
  await page.goto(HARNESS);
  await page.waitForSelector('[data-presence-harness-ready="true"]');
  // The presence module arrives with the hydrated client chunk, which can lag
  // the SSR markup on a cold dev server.
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __jetPresence?: unknown })
        .__jetPresence === "object",
    undefined,
    { timeout: 30_000, polling: 200 },
  );
}

async function setStatus(page: Page, userId: string, status: Status | null) {
  await page.evaluate(
    ([id, s]) => {
      (
        window as unknown as {
          __jetPresence: {
            setStatus: (u: string, v: Status | null) => void;
          };
        }
      ).__jetPresence.setStatus(id as string, s as Status | null);
    },
    [userId, status],
  );
}

function dot(page: Page, userId: string) {
  return page.locator(`[data-presence-user="${userId}"]`);
}

test.describe("presence dots", () => {
  test("header avatar dot reflects live status changes", async ({ page }) => {
    await gotoHarness(page);

    const selfDot = dot(page, SELF_ID);
    await expect(selfDot).toBeVisible();

    await setStatus(page, SELF_ID, "active");
    await expect(selfDot).toHaveAttribute("data-presence-status", "active");
    await expect(selfDot).toHaveAttribute("aria-label", "Active now");

    await setStatus(page, SELF_ID, "recent");
    await expect(selfDot).toHaveAttribute("data-presence-status", "recent");
    await expect(selfDot).toHaveAttribute("aria-label", "Recently active");

    await setStatus(page, SELF_ID, "away");
    await expect(selfDot).toHaveAttribute("data-presence-status", "away");
    await expect(selfDot).toHaveAttribute("aria-label", "Inactive");
  });

  test("social avatars update independently in realtime", async ({ page }) => {
    await gotoHarness(page);

    await setStatus(page, FRIEND_ID, "active");
    await setStatus(page, "harness-friend-2", "recent");
    await setStatus(page, "harness-friend-3", "away");

    await expect(dot(page, FRIEND_ID)).toHaveAttribute(
      "data-presence-status",
      "active",
    );
    await expect(dot(page, "harness-friend-2")).toHaveAttribute(
      "data-presence-status",
      "recent",
    );
    await expect(dot(page, "harness-friend-3")).toHaveAttribute(
      "data-presence-status",
      "away",
    );

    // Flipping one friend must not disturb the others.
    await setStatus(page, FRIEND_ID, "away");
    await expect(dot(page, FRIEND_ID)).toHaveAttribute(
      "data-presence-status",
      "away",
    );
    await expect(dot(page, "harness-friend-2")).toHaveAttribute(
      "data-presence-status",
      "recent",
    );
  });

  test("configurable thresholds are readable and adjustable", async ({
    page,
  }) => {
    await gotoHarness(page);

    const defaults = await page.evaluate(() =>
      (
        window as unknown as {
          __jetPresence: { getThresholds: () => Record<string, number> };
        }
      ).__jetPresence.getThresholds(),
    );
    expect(defaults.activeMs).toBeGreaterThan(0);
    expect(defaults.recentMs).toBeGreaterThan(defaults.activeMs);

    const updated = await page.evaluate(() => {
      const api = (
        window as unknown as {
          __jetPresence: {
            setThresholds: (t: Record<string, number>) => void;
            getThresholds: () => Record<string, number>;
          };
        }
      ).__jetPresence;
      api.setThresholds({ activeMs: 1000, recentMs: 4000, refreshMs: 500 });
      return api.getThresholds();
    });
    expect(updated.activeMs).toBe(1000);
    expect(updated.recentMs).toBe(4000);
    expect(updated.refreshMs).toBe(500);

    // Reset leaves the defaults intact for other specs on the same worker.
    await page.evaluate(() =>
      (
        window as unknown as { __jetPresence: { reset: () => void } }
      ).__jetPresence.reset(),
    );
  });

  test("mobile viewport renders dots offset over the avatar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHarness(page);

    await setStatus(page, SELF_ID, "active");
    const selfDot = dot(page, SELF_ID);
    await expect(selfDot).toBeVisible();

    const dotBox = await selfDot.boundingBox();
    const avatarBox = await page
      .getByTestId("harness-header-avatar")
      .boundingBox();
    expect(dotBox).not.toBeNull();
    expect(avatarBox).not.toBeNull();

    // Dot sits at the bottom-right corner, overlapping and slightly offset.
    expect(dotBox!.width).toBeGreaterThanOrEqual(10);
    expect(dotBox!.x + dotBox!.width).toBeGreaterThan(
      avatarBox!.x + avatarBox!.width - 4,
    );
    expect(dotBox!.y + dotBox!.height).toBeGreaterThan(
      avatarBox!.y + avatarBox!.height - 4,
    );

    await setStatus(page, SELF_ID, "away");
    await expect(selfDot).toHaveAttribute("data-presence-status", "away");
  });
});
