import { describe, it, expect } from "vitest";
import { createLocationSmoother, haversineMeters } from "@/lib/geo-smoothing";

const BASE = { lat: 35.2271, lng: -80.8431 };

describe("createLocationSmoother", () => {
  it("emits the first usable fix", () => {
    const s = createLocationSmoother();
    const fix = s.push({ ...BASE, accuracy: 10, timestamp: 0 });
    expect(fix).not.toBeNull();
    expect(haversineMeters(fix!, BASE)).toBeLessThan(2);
  });

  it("rejects low-accuracy fixes", () => {
    const s = createLocationSmoother();
    expect(s.push({ ...BASE, accuracy: 500, timestamp: 0 })).toBeNull();
  });

  it("suppresses stationary jitter", () => {
    const s = createLocationSmoother();
    s.push({ ...BASE, accuracy: 10, timestamp: 0 });
    // ~4m of jitter, well inside the noise floor
    const jitter = s.push({ lat: BASE.lat + 0.00003, lng: BASE.lng, accuracy: 10, timestamp: 6000 });
    expect(jitter).toBeNull();
  });

  it("rejects implausible teleports", () => {
    const s = createLocationSmoother();
    s.push({ ...BASE, accuracy: 10, timestamp: 0 });
    // 5km in 10 seconds
    expect(s.push({ lat: BASE.lat + 0.045, lng: BASE.lng, accuracy: 10, timestamp: 10_000 })).toBeNull();
  });

  it("tracks real movement but damps toward the estimate", () => {
    const s = createLocationSmoother();
    s.push({ ...BASE, accuracy: 10, timestamp: 0 });
    const target = { lat: BASE.lat + 0.0009, lng: BASE.lng };
    const fix = s.push({ ...target, accuracy: 10, timestamp: 60_000 });
    expect(fix).not.toBeNull();
    const movedFromBase = haversineMeters(BASE, fix!);
    expect(movedFromBase).toBeGreaterThan(10);
    expect(movedFromBase).toBeLessThan(haversineMeters(BASE, target));
  });

  it("snaps output to the jitter grid", () => {
    const s = createLocationSmoother();
    const fix = s.push({ lat: 35.22712345, lng: -80.84318765, accuracy: 5, timestamp: 0 })!;
    expect(Math.abs(Math.round(fix.lat / 0.00005) * 0.00005 - fix.lat)).toBeLessThan(1e-9);
  });

  it("resets cleanly", () => {
    const s = createLocationSmoother();
    s.push({ ...BASE, accuracy: 10, timestamp: 0 });
    s.reset();
    expect(s.push({ ...BASE, accuracy: 10, timestamp: 1000 })).not.toBeNull();
  });
});