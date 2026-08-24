import {
  Beer,
  Coffee,
  Martini,
  Music,
  Wine,
  Disc3,
  Drama,
  Dumbbell,
  Hotel,
  Palette,
  ShoppingBag,
  Trophy,
  TreePine,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for venue category iconology.
 *
 * Map markers (raw SVG injected into a Mapbox DOM marker), search result
 * thumbnails and category chips all used to carry their own copy of this
 * mapping, which drifted: the map knew about 8 categories, search knew about 8
 * different-looking ones, and neither understood everyday words like
 * "nightlife" or "drinks".
 *
 * Everything now derives from `VENUE_CATEGORIES`:
 *  - `Icon` is the React component (search, chips, JetCard).
 *  - `svg` is the same Lucide glyph as inner markup for the map markers.
 *  - `light` / `dark` are the accent hues per basemap style.
 *  - `synonyms` power search, so typing "drinks" surfaces bars.
 *
 * Order matters — the first entry whose `match` hits wins, so specific
 * categories come before broad ones and `food` is the fallback.
 */
export interface VenueCategoryDef {
  id: string;
  /** Human label used for chips and aria text. */
  label: string;
  /** Matches the raw category string coming from the venue/deal row. */
  match: RegExp;
  /** Everyday words users type that should resolve to this category. */
  synonyms: string[];
  /** Google Places `types` / `primaryType` values that belong to this bucket. */
  googleTypes: string[];
  Icon: LucideIcon;
  /** Lucide glyph paths for a 24x24 viewBox (map markers). */
  svg: string;
  /** Accent on a light basemap. */
  light: string;
  /** Accent on a dark basemap (also the UI accent — the app is dark-only). */
  dark: string;
}

export const VENUE_CATEGORIES: VenueCategoryDef[] = [
  {
    id: "brewery",
    label: "Breweries",
    match: /(brewer|brewing|brewpub|taproom|tap room|beer garden|biergarten|cidery|meadery)/,
    synonyms: ["brewery", "breweries", "beer", "taproom", "brewpub", "craft beer", "beer garden"],
    googleTypes: ["brewery", "beer_garden", "pub"],
    Icon: Beer,
    svg: '<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1-2.14-3.75c.5-.83 1.2-1.25 2.14-1.25.98 0 1.5.5 2.5.5s1.5-.5 3-.5 2 .5 3 .5 1.53-.5 2.5-.5c.94 0 1.63.42 2.14 1.25A2.5 2.5 0 0 1 16.5 8c-.78 0-1.72-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/>',
    light: "#9A6B12",
    dark: "#F0C36B",
  },
  {
    id: "lounge",
    label: "Lounges",
    match: /(lounge|speakeasy|hookah|shisha|cigar|rooftop)/,
    synonyms: ["lounge", "lounges", "speakeasy", "rooftop", "hookah", "chill", "cigar"],
    googleTypes: ["hookah_bar", "wine_bar"],
    Icon: Wine,
    svg: '<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-1-8H8c-.5 4-1 6-1 8a5 5 0 0 0 5 5Z"/>',
    light: "#8C3F63",
    dark: "#EFA2C7",
  },
  {
    id: "bar",
    label: "Bars & Cocktails",
    match: /(bar|cocktail|pub|tavern|beer|wine|winery|distiller|spirits|whiskey|sports bar)/,
    synonyms: ["bar", "bars", "drinks", "cocktails", "happy hour", "wine", "pub", "dive bar", "whiskey"],
    googleTypes: ["bar", "bar_and_grill", "liquor_store", "wine_bar"],
    Icon: Martini,
    svg: '<path d="M8 22h8"/><path d="M12 11v11"/><path d="M19 3H5l7 8z"/>',
    light: "#7C4DBE",
    dark: "#C6A0F5",
  },
  {
    id: "nightlife",
    label: "Clubs & Nightlife",
    match: /(night ?club|nightlife|club|dj|dance|disco|karaoke)/,
    synonyms: ["nightclub", "club", "clubs", "clubbing", "nightlife", "dancing", "dj", "party", "karaoke"],
    googleTypes: ["night_club", "dance_hall", "karaoke"],
    Icon: Disc3,
    svg: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 0 1 6.88 17.23"/><path d="M12 22a10 10 0 0 1-6.88-17.23"/>',
    light: "#A8286B",
    dark: "#F58BC0",
  },
  {
    id: "concerts",
    label: "Concerts & Live Music",
    match: /(concert|live music|music venue|band|amphitheat|music hall|gig|tour|dj set)/,
    synonyms: ["concert", "concerts", "live music", "shows tonight", "band", "gig", "amphitheater", "music"],
    googleTypes: ["concert_hall", "performing_arts_theater", "amphitheatre", "music_venue"],
    Icon: Music,
    svg: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    light: "#1D4F91",
    dark: "#8FB8F5",
  },
  {
    id: "coffee",
    label: "Coffee & Bakery",
    match: /(coffee|cafe|café|espresso|tea|bakery|bakeries|patisserie|dessert|ice cream|donut)/,
    synonyms: ["coffee", "coffee shop", "cafe", "espresso", "tea", "bakery", "dessert", "sweets", "brunch"],
    googleTypes: ["cafe", "coffee_shop", "bakery", "tea_house", "ice_cream_shop", "dessert_shop"],
    Icon: Coffee,
    svg: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
    light: "#B4682E",
    dark: "#F0B27A",
  },
  {
    id: "sports",
    label: "Sports & Games",
    match: /(sport|stadium|arena|ballpark|game|match|golf|bowling|pickleball|soccer|basketball|football|hockey|racing|tailgate)/,
    synonyms: ["sports", "sporting event", "game day", "stadium", "arena", "golf", "bowling", "watch party", "tailgate"],
    googleTypes: ["stadium", "arena", "sports_complex", "sports_club", "golf_course", "bowling_alley", "athletic_field"],
    Icon: Trophy,
    svg: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    light: "#1F6F3F",
    dark: "#86E0A4",
  },
  {
    id: "events",
    label: "Events & Shows",
    match: /(event|festival|theater|theatre|show|comedy|cinema|movie|performance|expo|convention)/,
    synonyms: ["event", "events", "festival", "theater", "show", "comedy", "movie", "performance", "tonight"],
    googleTypes: ["event_venue", "movie_theater", "comedy_club", "convention_center", "banquet_hall"],
    Icon: Drama,
    svg: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    light: "#B8860B",
    dark: "#F5D06F",
  },
  {
    id: "arts",
    label: "Arts & Culture",
    match: /(art|gallery|museum|exhibit|studio|craft)/,
    synonyms: ["art", "arts", "gallery", "museum", "exhibit", "culture"],
    googleTypes: ["art_gallery", "museum", "cultural_center", "art_studio"],
    Icon: Palette,
    svg: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    light: "#1F7A8C",
    dark: "#7FD8E8",
  },
  {
    id: "fitness",
    label: "Fitness & Wellness",
    match: /(gym|fitness|yoga|pilates|climb|cycle|run|spa|wellness|sauna|salon|barber)/,
    synonyms: ["gym", "fitness", "workout", "yoga", "pilates", "spa", "wellness", "salon"],
    googleTypes: ["gym", "fitness_center", "yoga_studio", "spa", "wellness_center", "beauty_salon", "barber_shop"],
    Icon: Dumbbell,
    svg: '<path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
    light: "#2E7D6B",
    dark: "#7FDCC2",
  },
  {
    id: "outdoors",
    label: "Outdoors",
    match: /(park|trail|garden|greenway|outdoor|hike|lake|river|beach|patio)/,
    synonyms: ["park", "outdoors", "trail", "greenway", "garden", "hike", "patio"],
    googleTypes: ["park", "national_park", "hiking_area", "campground", "beach", "garden"],
    Icon: TreePine,
    svg: '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>',
    light: "#4A7C2F",
    dark: "#A8DE7F",
  },
  {
    id: "shopping",
    label: "Shopping",
    match: /(shop|retail|store|market|boutique|mall|thrift|vintage)/,
    synonyms: ["shopping", "shops", "retail", "store", "market", "boutique", "thrift"],
    googleTypes: ["shopping_mall", "clothing_store", "store", "market", "book_store", "gift_shop"],
    Icon: ShoppingBag,
    svg: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    light: "#1E6FA8",
    dark: "#7FC4F2",
  },
  {
    id: "hotel",
    label: "Hotels & Stays",
    match: /(hotel|stay|lodging|resort|inn|motel|hostel)/,
    synonyms: ["hotel", "hotels", "stay", "resort", "lodging"],
    googleTypes: ["hotel", "lodging", "resort_hotel", "motel", "hostel"],
    Icon: Hotel,
    svg: '<path d="M2 22V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14"/><path d="M2 18h20"/><circle cx="8" cy="12" r="2"/>',
    light: "#6B5BA8",
    dark: "#B3AAF0",
  },
  {
    id: "food",
    label: "Food & Dining",
    // Fallback bucket — the regex still lets an explicit food category match
    // ahead of anything unexpected upstream.
    match: /(food|restaurant|dining|eat|kitchen|grill|pizza|taco|sushi|bbq|burger|diner|deli|steak|seafood|ramen|noodle|brunch)/,
    synonyms: ["food", "restaurants", "dining", "eat", "dinner", "lunch", "pizza", "tacos", "sushi", "bbq", "brunch"],
    googleTypes: ["restaurant", "meal_takeaway", "meal_delivery", "food_court", "fast_food_restaurant", "steak_house", "sushi_restaurant", "pizza_restaurant", "barbecue_restaurant", "seafood_restaurant", "ramen_restaurant"],
    Icon: Utensils,
    svg: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    light: "#C13B5A",
    dark: "#FF8FA3",
  },
];

const FALLBACK = VENUE_CATEGORIES[VENUE_CATEGORIES.length - 1];

/** Resolve any raw category / deal_type string to its taxonomy entry. */
export const resolveVenueCategory = (
  category?: string | null,
): VenueCategoryDef => {
  const c = (category || "").toLowerCase().trim();
  if (!c) return FALLBACK;
  return VENUE_CATEGORIES.find((def) => def.match.test(c)) ?? FALLBACK;
};

/**
 * Does a search query describe this category, either literally or through one
 * of its everyday synonyms? Returns a small score so callers can rank:
 * 3 = the category string itself matched, 2 = synonym prefix, 1 = substring.
 */
export const categorySynonymScore = (
  category: string | null | undefined,
  query: string,
): number => {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const def = resolveVenueCategory(category);
  if (def.id === q || def.label.toLowerCase() === q) return 3;
  for (const syn of def.synonyms) {
    if (syn === q) return 3;
    if (syn.startsWith(q) && q.length >= 3) return 2;
    if (q.length >= 4 && syn.includes(q)) return 1;
  }
  return 0;
};

/**
 * Resolve a Google Places result to the same taxonomy the map markers,
 * JetCards and search chips use. Google's `primaryType` wins, then any of the
 * `types` array, then the free-text category label we may already have stored.
 */
export const resolveVenueCategoryFromPlace = (place: {
  primaryType?: string | null;
  types?: readonly string[] | null;
  category?: string | null;
}): VenueCategoryDef => {
  const candidates = [
    ...(place.primaryType ? [place.primaryType] : []),
    ...((place.types ?? []) as string[]),
  ].map((t) => t.toLowerCase());
  for (const type of candidates) {
    const hit = VENUE_CATEGORIES.find((def) => def.googleTypes.includes(type));
    if (hit) return hit;
  }
  // Google types like "italian_restaurant" aren't in the list verbatim; fall
  // back to the regex path using the underscored type as free text.
  for (const type of candidates) {
    const asText = type.replace(/_/g, " ");
    const hit = VENUE_CATEGORIES.find((def) => def.match.test(asText));
    if (hit) return hit;
  }
  return resolveVenueCategory(place.category);
};

/** Filter chips shown on the map, in display order. */
export const CATEGORY_FILTER_IDS = [
  "food",
  "bar",
  "brewery",
  "lounge",
  "nightlife",
  "concerts",
  "sports",
  "coffee",
  "events",
] as const;

export const getCategoryById = (id: string): VenueCategoryDef | undefined =>
  VENUE_CATEGORIES.find((def) => def.id === id);
