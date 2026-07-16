import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LAYER_KEYS,
  clearPersistedLayerState,
  clearPersistedLayerUrl,
  LAYER_URL_PARAMS,
  readLayerState,
} from "../layerPersistence";

/**
 * Persistence contract tests for the Heatmap and Flow Paths toggles.
 *
 * These lock in the user-visible behavior across:
 *  - mobile and desktop (persistence is viewport-agnostic — same localStorage
 *    keys, no matchMedia branching),
 *  - collapsing / expanding the layers panel (component stays mounted, so
 *    localStorage keeps its value — verified by reading back after writes),
 *  - full page refresh (a fresh reader picks up the persisted value),
 *  - the "Reset to defaults" button (clearPersistedLayerState removes keys
 *    and the reader returns the fallback again),
 *  - user clearing localStorage / private mode (reader gracefully falls back).
 */
describe("layer persistence contract", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the stable localStorage keys the app writes to", () => {
    // These keys are part of the persistence contract; renaming them
    // silently orphans every existing user's saved toggle state.
    expect(LAYER_KEYS.density).toBe("jet-map-layer-density");
    expect(LAYER_KEYS.paths).toBe("jet-map-layer-paths");
  });

  describe("fresh session (no URL, no storage) — mobile and desktop", () => {
    it.each([
      ["mobile viewport", 375],
      ["desktop viewport", 1440],
    ])("returns the fallback on %s", (_label, width) => {
      // Persistence must not depend on viewport width. Simulate both.
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      expect(readLayerState("density", "", false)).toBe(false);
      expect(readLayerState("paths", "", false)).toBe(false);
    });
  });

  describe("after the user toggles a layer on", () => {
    it("survives a simulated panel collapse/expand (same session, same storage)", () => {
      // The panel collapse doesn't unmount the component — but any read
      // performed after a toggle should still see the persisted value.
      localStorage.setItem(LAYER_KEYS.density, "true");
      localStorage.setItem(LAYER_KEYS.paths, "true");

      expect(readLayerState("density", "", false)).toBe(true);
      expect(readLayerState("paths", "", false)).toBe(true);
    });

    it("survives a full refresh (fresh reader picks up persisted values)", () => {
      localStorage.setItem(LAYER_KEYS.density, "true");
      localStorage.setItem(LAYER_KEYS.paths, "false");

      // Simulate app boot on a new page load: no URL params, defaults false.
      expect(readLayerState("density", "", false)).toBe(true);
      expect(readLayerState("paths", "", false)).toBe(false);
    });

    it("independently tracks the Heatmap and Flow Paths toggles", () => {
      localStorage.setItem(LAYER_KEYS.density, "true");
      // paths intentionally not set
      expect(readLayerState("density", "", false)).toBe(true);
      expect(readLayerState("paths", "", false)).toBe(false);

      localStorage.setItem(LAYER_KEYS.paths, "true");
      localStorage.removeItem(LAYER_KEYS.density);
      expect(readLayerState("density", "", false)).toBe(false);
      expect(readLayerState("paths", "", false)).toBe(true);
    });
  });

  describe("URL param deep links", () => {
    it("`?layers=density,paths` enables both regardless of storage", () => {
      localStorage.setItem(LAYER_KEYS.density, "false");
      localStorage.setItem(LAYER_KEYS.paths, "false");

      expect(readLayerState("density", "?layers=density,paths", false)).toBe(true);
      expect(readLayerState("paths", "?layers=density,paths", false)).toBe(true);
    });

    it("omitting a layer from `?layers=` falls back to storage, not off", () => {
      // Deep-linking only `density` shouldn't silently disable the user's
      // previously persisted `paths` toggle.
      localStorage.setItem(LAYER_KEYS.paths, "true");

      expect(readLayerState("density", "?layers=density", false)).toBe(true);
      expect(readLayerState("paths", "?layers=density", false)).toBe(true);
    });

    it("ignores unknown tokens in `?layers=`", () => {
      expect(readLayerState("density", "?layers=bogus,density", false)).toBe(true);
      expect(readLayerState("paths", "?layers=bogus", false)).toBe(false);
    });
  });

  describe("Reset to defaults", () => {
    it("clearPersistedLayerState removes every layer key", () => {
      localStorage.setItem(LAYER_KEYS.density, "true");
      localStorage.setItem(LAYER_KEYS.paths, "true");
      localStorage.setItem(LAYER_KEYS.parking, "true");
      localStorage.setItem(LAYER_KEYS.stats, "true");

      clearPersistedLayerState();

      Object.values(LAYER_KEYS).forEach((key) => {
        expect(localStorage.getItem(key)).toBeNull();
      });
    });

    it("after Reset, a fresh reader returns the fallback", () => {
      localStorage.setItem(LAYER_KEYS.density, "true");
      localStorage.setItem(LAYER_KEYS.paths, "true");

      clearPersistedLayerState();

      expect(readLayerState("density", "", false)).toBe(false);
      expect(readLayerState("paths", "", false)).toBe(false);
    });

    it("clearPersistedLayerUrl strips every layer/filter query param", () => {
      window.history.replaceState(
        null,
        "",
        "/?layers=density,paths&time=today&day=3&pathTime=this_week&keep=me",
      );

      const ok = clearPersistedLayerUrl();
      expect(ok).toBe(true);

      const params = new URLSearchParams(window.location.search);
      LAYER_URL_PARAMS.forEach((key) => {
        expect(params.has(key)).toBe(false);
      });
      // Unrelated params are preserved.
      expect(params.get("keep")).toBe("me");
    });

    it("clearPersistedLayerUrl leaves a bare path when it was the only source", () => {
      window.history.replaceState(null, "", "/?layers=density,paths");
      clearPersistedLayerUrl();
      expect(window.location.search).toBe("");
    });

    it("Reset (URL + storage) leaves the reader returning defaults on next boot", () => {
      // Simulate the exact starting state before a Reset click.
      window.history.replaceState(null, "", "/?layers=density,paths");
      localStorage.setItem(LAYER_KEYS.density, "true");
      localStorage.setItem(LAYER_KEYS.paths, "true");

      // Same order the component now uses: URL first, then storage.
      clearPersistedLayerUrl();
      clearPersistedLayerState();

      // Simulate a page refresh — reader consults fresh URL + storage.
      expect(readLayerState("density", window.location.search, false)).toBe(false);
      expect(readLayerState("paths", window.location.search, false)).toBe(false);
    });
  });

  describe("localStorage cleared or unavailable", () => {
    it("returns the fallback when localStorage is empty (user cleared site data)", () => {
      localStorage.clear();
      expect(readLayerState("density", "", false)).toBe(false);
      expect(readLayerState("paths", "", true)).toBe(true);
    });

    it("returns the fallback when localStorage.getItem throws (private mode / quota)", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError: storage disabled");
      });

      expect(readLayerState("density", "", false)).toBe(false);
      expect(readLayerState("paths", "", true)).toBe(true);
    });

    it("still honors URL param even when storage throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError: storage disabled");
      });

      expect(readLayerState("density", "?layers=density", false)).toBe(true);
    });
  });
});