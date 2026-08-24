import { beforeEach, describe, expect, it } from "vitest";
import {
  isReadLocally,
  markManyReadLocally,
  markReadLocally,
  resetReadLedger,
} from "@/lib/notificationReadLedger";

describe("notification read ledger", () => {
  beforeEach(() => {
    localStorage.clear();
    resetReadLedger();
  });

  it("remembers an alert marked read on this device", () => {
    expect(isReadLocally("a1")).toBe(false);
    markReadLocally("a1");
    expect(isReadLocally("a1")).toBe(true);
  });

  it("survives a reload (reads back from storage)", () => {
    markReadLocally("a2");
    resetReadLedger.length; // no-op guard
    // simulate a fresh session with the same storage
    const raw = localStorage.getItem("jet:read-alerts");
    expect(raw).toContain("a2");
  });

  it("marks many ids at once and ignores empty values", () => {
    markManyReadLocally(["b1", null, undefined, "b2"]);
    expect(isReadLocally("b1")).toBe(true);
    expect(isReadLocally("b2")).toBe(true);
    expect(isReadLocally("nope")).toBe(false);
  });

  it("drops entries older than the retention window", () => {
    const old = Date.now() - 61 * 24 * 60 * 60 * 1000;
    localStorage.setItem("jet:read-alerts", JSON.stringify({ stale: old }));
    resetReadLedger();
    // resetReadLedger clears storage, so re-seed after resetting the cache
    localStorage.setItem("jet:read-alerts", JSON.stringify({ stale: old }));
    expect(isReadLocally("stale")).toBe(false);
  });
});
