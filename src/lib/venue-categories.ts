import {
  Beer,
  Coffee,
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
    id: "coffee",
    label: "Coffee & Bakery",
    match: /(coffee|cafe|café|espresso|tea|bakery|bakeries|patisserie|dessert|ice cream|donut)/,
    synonyms: ["coffee", "cafe", "espresso", "tea", "bakery", "dessert", "sweets", "brunch"],
    Icon: Coffee,
    svg: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
    light: "#B4682E",
    dark: "#F0B27A",
  },
  {
    id: "nightlife",
    label: "Nightlife",
    match: /(night|club|dj|dance|music|concert|live music|karaoke|rooftop)/,
    synonyms: ["nightlife", "night out", "club", "clubbing", "dancing", "dj", "live music", "concert", "karaoke", "party"],
    Icon: Disc3,
    svg: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M9 18V5l12-2v13"/>',
    light: "#A8286B",
    dark: "#F58BC0",
  },
  {
    id: "bar",
    label: "Bars & Drinks",
    match: /(bar|cocktail|lounge|pub|tavern|brew|beer|wine|winery|distiller|spirits|speakeasy|taproom)/,
    synonyms: ["bar", "bars", "drinks", "cocktails", "happy hour", "beer", "brewery", "wine", "pub", "lounge"],
    Icon: Beer,
    svg: '<path d="M8 22h8"/><path d="M12 11v11"/><path d="M19 3H5l7 8z"/>',
    light: "#7C4DBE",
    dark: "#C6A0F5",
  },
  {
    id: "arts",
    label: "Arts & Culture",
    match: /(art|gallery|museum|exhibit|studio|craft)/,
    synonyms: ["art", "arts", "gallery", "museum", "exhibit", "culture"],
    Icon: Palette,
    svg: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    light: "#1F7A8C",
    dark: "#7FD8E8",
  },
  {
    id: "events",
    label: "Events & Shows",
    match: /(event|festival|theater|theatre|show|comedy|cinema|movie|performance)/,
    synonyms: ["event", "events", "festival", "theater", "show", "comedy", "movie", "performance", "tonight"],
    Icon: Drama,
    svg: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    light: "#B8860B",
    dark: "#F5D06F",
  },
  {
    id: "sports",
    label: "Sports",
    match: /(sport|stadium|arena|game|match|golf|bowling|pickleball|soccer|basketball|football)/,
    synonyms: ["sports", "game day", "stadium", "arena", "golf", "bowling", "watch party"],
    Icon: Trophy,
    svg: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    light: "#1F6F3F",
    dark: "#86E0A4",
  },
  {
    id: "fitness",
    label: "Fitness & Wellness",
    match: /(gym|fitness|yoga|pilates|climb|cycle|run|spa|wellness|sauna|salon|barber)/,
    synonyms: ["gym", "fitness", "workout", "yoga", "pilates", "spa", "wellness", "salon"],
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
    match: /(food|restaurant|dining|eat|kitchen|grill|pizza|taco|sushi|bbq|burger|diner|deli|steak)/,
    synonyms: ["food", "restaurants", "dining", "eat", "dinner", "lunch", "pizza", "tacos", "sushi", "bbq", "brunch"],
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
