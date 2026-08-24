import { describe, expect, it } from "vitest";
import { getDealPresentation } from "@/lib/dealPresentation";

const NOW = Date.parse("2026-01-01T00:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

describe("getDealPresentation", () => {
  it("title-cases the merchant deal type and picks its emoji", () => {
    const p = getDealPresentation({ deal_type: "OFFER" }, NOW);
    expect(p.typeLabel).toBe("Offer");
    expect(p.typeId).toBe("offer");
    expect(p.typeEmoji).toBe("🎉");
  });

  it("resolves the venue category from merchant text", () => {
    const p = getDealPresentation(
      { deal_type: "special", venue_name: "Noda Brewing Company" },
      NOW,
    );
    expect(p.category.id).toBe("brewery");
  });

  it("renders identical expiry data for every surface", () => {
    const p = getDealPresentation({ expires_at: inHours(50) }, NOW);
    expect(p.expiry?.label).toBe("2d left");
    expect(p.expiry?.longLabel).toBe("2 days left");
    expect(p.expiry?.badgeLabel).toBe("Expires in 2d");
  });

  it("marks past end dates as expired", () => {
    const p = getDealPresentation({ expires_at: inHours(-1) }, NOW);
    expect(p.expiry?.expired).toBe(true);
    expect(p.expiry?.badgeLabel).toBe("Expired");
  });

  it("returns null expiry when the merchant set no end date", () => {
    expect(getDealPresentation({ deal_type: "event" }, NOW).expiry).toBeNull();
  });
});
