import { describe, expect, it } from "vitest";
import {
  parseSocialInput,
  parseSocialLink,
  platformForHost,
} from "@/lib/socialHandles";

describe("parseSocialLink", () => {
  it("normalizes a typed @handle", () => {
    expect(parseSocialLink("instagram", "  @JetAround ")).toEqual({
      status: "ok",
      handle: "JetAround",
      url: "https://instagram.com/JetAround",
    });
  });

  it("extracts the handle from a pasted profile URL", () => {
    expect(parseSocialLink("instagram", "https://www.instagram.com/jetaround/?hl=en"))
      .toMatchObject({ status: "ok", handle: "jetaround" });
    expect(parseSocialLink("twitter", "x.com/jetaround")).toMatchObject({
      status: "ok",
      handle: "jetaround",
      url: "https://x.com/jetaround",
    });
    expect(
      parseSocialLink("linkedin", "https://linkedin.com/in/brandon-hodges/"),
    ).toMatchObject({ status: "ok", handle: "brandon-hodges" });
    expect(parseSocialLink("tiktok", "https://tiktok.com/@jetaround")).toMatchObject({
      status: "ok",
      handle: "jetaround",
      url: "https://tiktok.com/@jetaround",
    });
  });

  it("rejects unknown hosts instead of storing junk", () => {
    const result = parseSocialLink("instagram", "https://evil.example.com/jetaround");
    expect(result.status).toBe("error");
    expect(result.handle).toBe("");
  });

  it("flags a link pasted into the wrong platform field", () => {
    const result = parseSocialLink("twitter", "https://instagram.com/jetaround");
    expect(result).toMatchObject({ status: "error", detectedPlatform: "instagram" });
  });

  it("rejects non-profile paths", () => {
    expect(parseSocialLink("instagram", "https://instagram.com/p/Cabc123").status).toBe(
      "error",
    );
    expect(parseSocialLink("linkedin", "https://linkedin.com/company/jet").status).toBe(
      "error",
    );
  });

  it("rejects invalid characters and over-long handles", () => {
    expect(parseSocialLink("twitter", "jet around").status).toBe("error");
    expect(parseSocialLink("twitter", "@jet!around").status).toBe("error");
    expect(parseSocialLink("twitter", "a".repeat(16)).status).toBe("error");
  });

  it("treats blank input as empty", () => {
    expect(parseSocialLink("facebook", "   ").status).toBe("empty");
  });

  it("parseSocialInput returns empty strings for invalid input", () => {
    expect(parseSocialInput("instagram", "https://evil.example.com/x")).toEqual({
      handle: "",
      url: "",
    });
  });
});

describe("platformForHost", () => {
  it("maps known hosts", () => {
    expect(platformForHost("www.x.com")).toBe("twitter");
    expect(platformForHost("fb.com")).toBe("facebook");
    expect(platformForHost("example.com")).toBeNull();
  });
});
