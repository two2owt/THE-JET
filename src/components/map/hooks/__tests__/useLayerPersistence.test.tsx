import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLayerPersistence } from "../useLayerPersistence";
import { LAYER_KEYS } from "@/components/map/layerPersistence";

/**
 * Write-side persistence tests for the Heatmap and Flow Paths toggles.
 *
 * Verifies that every state change flushes to the exact localStorage keys
 * the reader (`readLayerState`) picks up on refresh — closing the loop for
 * the persistence contract exercised in `layerPersistence.test.ts`.
 */
const FILTER_KEYS = {
  timeFilter: "jet-map-time-filter",
  pathTimeFilter: "jet-map-path-time-filter",
  dayFilter: "jet-map-day-filter",
  timelapseMode: "jet-map-timelapse-mode",
  timelapseSpeed: "jet-map-timelapse-speed",
  heatIntensity: "jet-map-heat-intensity",
  heatRadius: "jet-map-heat-radius",
  heatOpacity: "jet-map-heat-opacity",
  densityWindow: "jet-map-density-window",
  pathsWindow: "jet-map-paths-window",
} as const;

function render(showDensityLayer: boolean, showMovementPaths: boolean) {
  return renderHook(({ density, paths }: { density: boolean; paths: boolean }) =>
    useLayerPersistence({
      layerKeys: LAYER_KEYS,
      filterKeys: FILTER_KEYS,
      showDensityLayer: density,
      showMovementPaths: paths,
      showParking: false,
      showLiveStats: false,
      timeFilter: "all",
      pathTimeFilter: "all",
      dayFilter: undefined,
      timelapseMode: false,
      heatIntensity: 1,
      heatRadius: 1,
      heatOpacity: 1,
      densityWindowMinutes: null,
      pathsWindowMinutes: null,
    }),
    { initialProps: { density: showDensityLayer, paths: showMovementPaths } },
  );
}

describe("useLayerPersistence — Heatmap and Flow Paths", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes both toggles to localStorage on mount", () => {
    render(true, false);
    expect(localStorage.getItem(LAYER_KEYS.density)).toBe("true");
    expect(localStorage.getItem(LAYER_KEYS.paths)).toBe("false");
  });

  it("updates localStorage when toggles flip (simulates user tap)", () => {
    const { rerender } = render(false, false);
    expect(localStorage.getItem(LAYER_KEYS.density)).toBe("false");
    expect(localStorage.getItem(LAYER_KEYS.paths)).toBe("false");

    rerender({ density: true, paths: true });
    expect(localStorage.getItem(LAYER_KEYS.density)).toBe("true");
    expect(localStorage.getItem(LAYER_KEYS.paths)).toBe("true");

    rerender({ density: false, paths: true });
    expect(localStorage.getItem(LAYER_KEYS.density)).toBe("false");
    expect(localStorage.getItem(LAYER_KEYS.paths)).toBe("true");
  });

  it("persisted state survives an unmount/remount cycle (simulated refresh)", () => {
    const { unmount } = render(true, true);
    expect(localStorage.getItem(LAYER_KEYS.density)).toBe("true");
    expect(localStorage.getItem(LAYER_KEYS.paths)).toBe("true");
    unmount();

    // localStorage is shared across mounts — a fresh mount would read the
    // same keys via `readLayerState`. Simulate that read here.
    expect(localStorage.getItem(LAYER_KEYS.density)).toBe("true");
    expect(localStorage.getItem(LAYER_KEYS.paths)).toBe("true");
  });
});