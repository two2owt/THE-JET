import { describe, expect, it } from "vitest";
import {
  categorySynonymScore,
  resolveVenueCategory,
} from "@/lib/venue-categories";
import { getCategoryIcon, getCategoryFloral } from "@/components/map/markerStyles";
import { categoryIconFor } from "@/lib/category-icon";

describe("venue category taxonomy", () => {
  it("resolves raw category strings to the right bucket", () => {
    expect(resolveVenueCategory("Cocktail Bar").id).toBe("bar");
    expect(resolveVenueCategory("Coffee Shop").id).toBe("coffee");
    expect(resolveVenueCategory("Night Club").id).toBe("nightlife");
    expect(resolveVenueCategory("Art Gallery").id).toBe("arts");
    expect(resolveVenueCategory("Greenway Park").id).toBe("outdoors");
    expect(resolveVenueCategory("Sports Bar").id).toBe("nightlife");
  });

  it("falls back to food for unknown or empty categories", () => {
    expect(resolveVenueCategory("").id).toBe("food");
    expect(resolveVenueCategory("???").id).toBe("food");
    expect(resolveVenueCategory("Taco Restaurant").id).toBe("food");
  });

  it("matches everyday search words through synonyms", () => {
    expect(categorySynonymScore("Cocktail Bar", "drinks")).toBeGreaterThan(0);
    expect(categorySynonymScore("Night Club", "nightlife")).toBeGreaterThan(0);
    expect(categorySynonymScore("Bakery", "brunch")).toBeGreaterThan(0);
    expect(categorySynonymScore("Cocktail Bar", "hotel")).toBe(0);
    expect(categorySynonymScore("Cocktail Bar", "")).toBe(0);
  });

  it("keeps map markers and search UI on the same glyph + accent", () => {
    const category = "Coffee Shop";
    const def = resolveVenueCategory(category);
    expect(getCategoryIcon(category)).toBe(def.svg);
    expect(getCategoryFloral(category)).toEqual({
      light: def.light,
      dark: def.dark,
    });
    expect(categoryIconFor(category).accent).toBe(def.dark);
    expect(categoryIconFor(category).Icon).toBe(def.Icon);
  });
});
