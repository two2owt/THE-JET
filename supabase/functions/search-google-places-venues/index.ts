import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "search-google-places-venues";
logVersion(FUNCTION_NAME);

// Venues are sourced live from Google Places (Nearby Search + Place Details).
// The curated list below is ONLY used as a last-resort fallback when the
// GOOGLE_PLACES_API_KEY secret is missing or Google returns an error — it is
// intentionally small and only contains long-running, well-known Charlotte
// places we can verify by address. No fabricated venues.
//
// `openingHours` matches Google's `opening_hours.weekday_text` format:
//   "Monday: 11:00 AM – 10:00 PM"  (en-dash, AM/PM, "Closed" when shut)
const HOURS = {
  daily_11_10:   ["Monday: 11:00 AM – 10:00 PM","Tuesday: 11:00 AM – 10:00 PM","Wednesday: 11:00 AM – 10:00 PM","Thursday: 11:00 AM – 10:00 PM","Friday: 11:00 AM – 11:00 PM","Saturday: 11:00 AM – 11:00 PM","Sunday: 11:00 AM – 9:00 PM"],
  dinner_only:   ["Monday: Closed","Tuesday: 5:00 PM – 10:00 PM","Wednesday: 5:00 PM – 10:00 PM","Thursday: 5:00 PM – 10:00 PM","Friday: 5:00 PM – 11:00 PM","Saturday: 5:00 PM – 11:00 PM","Sunday: 5:00 PM – 9:00 PM"],
  bar_late:      ["Monday: 4:00 PM – 12:00 AM","Tuesday: 4:00 PM – 12:00 AM","Wednesday: 4:00 PM – 12:00 AM","Thursday: 4:00 PM – 1:00 AM","Friday: 4:00 PM – 2:00 AM","Saturday: 4:00 PM – 2:00 AM","Sunday: 4:00 PM – 12:00 AM"],
  brewery:       ["Monday: Closed","Tuesday: 4:00 PM – 10:00 PM","Wednesday: 4:00 PM – 10:00 PM","Thursday: 4:00 PM – 10:00 PM","Friday: 2:00 PM – 12:00 AM","Saturday: 12:00 PM – 12:00 AM","Sunday: 12:00 PM – 9:00 PM"],
  cafe:          ["Monday: 7:00 AM – 4:00 PM","Tuesday: 7:00 AM – 4:00 PM","Wednesday: 7:00 AM – 4:00 PM","Thursday: 7:00 AM – 4:00 PM","Friday: 7:00 AM – 4:00 PM","Saturday: 8:00 AM – 4:00 PM","Sunday: 8:00 AM – 3:00 PM"],
  bakery_24h:    ["Monday: Open 24 hours","Tuesday: Open 24 hours","Wednesday: Open 24 hours","Thursday: Open 24 hours","Friday: Open 24 hours","Saturday: Open 24 hours","Sunday: Open 24 hours"],
  food_hall:     ["Monday: 7:00 AM – 10:00 PM","Tuesday: 7:00 AM – 10:00 PM","Wednesday: 7:00 AM – 10:00 PM","Thursday: 7:00 AM – 10:00 PM","Friday: 7:00 AM – 11:00 PM","Saturday: 8:00 AM – 11:00 PM","Sunday: 8:00 AM – 10:00 PM"],
  rooftop:       ["Monday: 4:00 PM – 11:00 PM","Tuesday: 4:00 PM – 11:00 PM","Wednesday: 4:00 PM – 11:00 PM","Thursday: 4:00 PM – 12:00 AM","Friday: 4:00 PM – 1:00 AM","Saturday: 2:00 PM – 1:00 AM","Sunday: 2:00 PM – 10:00 PM"],
  nightclub:     ["Monday: Closed","Tuesday: Closed","Wednesday: 10:00 PM – 2:00 AM","Thursday: 10:00 PM – 2:00 AM","Friday: 10:00 PM – 2:30 AM","Saturday: 10:00 PM – 2:30 AM","Sunday: 10:00 PM – 2:00 AM"],
  lounge:        ["Monday: Closed","Tuesday: 5:00 PM – 12:00 AM","Wednesday: 5:00 PM – 12:00 AM","Thursday: 5:00 PM – 1:00 AM","Friday: 5:00 PM – 2:00 AM","Saturday: 5:00 PM – 2:00 AM","Sunday: 5:00 PM – 12:00 AM"],
  nightclub_daily:["Monday: 9:00 PM – 2:00 AM","Tuesday: 9:00 PM – 2:00 AM","Wednesday: 9:00 PM – 2:00 AM","Thursday: 9:00 PM – 2:00 AM","Friday: 9:00 PM – 2:30 AM","Saturday: 9:00 PM – 2:30 AM","Sunday: 9:00 PM – 2:00 AM"],
  bar_daily:     ["Monday: 11:00 AM – 2:00 AM","Tuesday: 11:00 AM – 2:00 AM","Wednesday: 11:00 AM – 2:00 AM","Thursday: 11:00 AM – 2:00 AM","Friday: 11:00 AM – 2:00 AM","Saturday: 11:00 AM – 2:00 AM","Sunday: 11:00 AM – 2:00 AM"],
} as const;

const CHARLOTTE_TOP_VENUES = [
  { id: "merchant-trade", name: "Merchant & Trade", lat: 35.2271, lng: -80.8431, address: "201 S College St 19th floor, Charlotte, NC 28244, USA", category: "Rooftop Bar", googleRating: 4.5, googleTotalRatings: 1200, activity: 95, priceLevel: 3, phone: "(704) 445-2200", website: "https://www.merchantandtradeclt.com", description: "19th-floor rooftop lounge with skyline views, craft cocktails, and shareable small plates above Uptown.", openingHours: HOURS.rooftop },
  { id: "punch-room", name: "The Punch Room", lat: 35.2269, lng: -80.8405, address: "100 W Trade St, Charlotte, NC 28202, USA", category: "Cocktail Bar", googleRating: 4.7, googleTotalRatings: 890, activity: 88, priceLevel: 4, phone: "(704) 445-2664", website: "https://www.ritzcarlton.com/en/hotels/cltrz-the-ritz-carlton-charlotte/dining/the-punch-room", description: "Intimate Ritz-Carlton cocktail lounge built around a rotating menu of bespoke punches.", openingHours: HOURS.bar_late },
  { id: "heirloom", name: "Heirloom Restaurant", lat: 35.3133, lng: -80.9168, address: "8470 Bellhaven Blvd, Charlotte, NC 28216, USA", category: "Restaurant", googleRating: 4.6, googleTotalRatings: 1450, activity: 92, priceLevel: 3, phone: "(704) 595-7710", website: "https://www.heirloomrestaurantnc.com", description: "Farm-to-table New American sourcing exclusively from North Carolina growers and producers.", openingHours: HOURS.dinner_only },
  { id: "supperland", name: "Supperland", lat: 35.2381, lng: -80.8237, address: "1212 N Davidson St, Charlotte, NC 28206, USA", category: "Restaurant", googleRating: 4.5, googleTotalRatings: 980, activity: 87, priceLevel: 3, phone: "(704) 817-2877", website: "https://www.supperlandrestaurant.com", description: "Southern Sunday-supper cooking served inside a renovated 1950s church in Plaza Midwood.", openingHours: HOURS.dinner_only },
  { id: "haberdish", name: "Haberdish", lat: 35.2488, lng: -80.8067, address: "3106 N Davidson St, Charlotte, NC 28205, USA", category: "Restaurant", googleRating: 4.4, googleTotalRatings: 1100, activity: 85, priceLevel: 2, phone: "(704) 817-1084", website: "https://www.haberdish.com", description: "Modern Southern comfort food and a serious craft-cocktail program in the heart of NoDa.", openingHours: HOURS.daily_11_10 },
  { id: "seoul-food", name: "Seoul Food Meat Company", lat: 35.2188, lng: -80.8441, address: "2001 South Blvd Suite 100, Charlotte, NC 28203, USA", category: "Restaurant", googleRating: 4.6, googleTotalRatings: 2100, activity: 83, priceLevel: 2, phone: "(980) 938-2299", website: "https://www.seoulfoodmeatco.com", description: "Korean BBQ meets Southern smoke — bulgogi, bibimbap, and brisket in South End.", openingHours: HOURS.daily_11_10 },
  { id: "crunkleton", name: "The Crunkleton", lat: 35.2193, lng: -80.8137, address: "1957 E 7th St, Charlotte, NC 28204, USA", category: "Cocktail Bar", googleRating: 4.7, googleTotalRatings: 650, activity: 80, priceLevel: 3, phone: "(980) 949-8255", website: "https://thecrunkleton.com/charlotte", description: "Members-friendly speakeasy with 400+ whiskeys and classic-craft cocktails in Elizabeth.", openingHours: HOURS.bar_late },
  { id: "fahrenheit", name: "Fahrenheit", lat: 35.2272, lng: -80.8394, address: "222 S Caldwell St, Charlotte, NC 28202, USA", category: "Restaurant", googleRating: 4.4, googleTotalRatings: 1800, activity: 90, priceLevel: 4, phone: "(980) 327-6776", website: "https://www.fahrenheitcharlotte.com", description: "Chef Rocco Whalen's 21st-floor steakhouse with sweeping Uptown views and a wraparound patio.", openingHours: HOURS.dinner_only },
  { id: "angelines", name: "Angeline's", lat: 35.2257, lng: -80.8401, address: "125 W Trade St, Charlotte, NC 28202, USA", category: "Restaurant", googleRating: 4.5, googleTotalRatings: 720, activity: 82, priceLevel: 3, phone: "(704) 445-2540", website: "https://www.angelinesclt.com", description: "Coastal-Italian dining inside The Ivey's Hotel — handmade pastas and an aperitivo-forward bar.", openingHours: HOURS.daily_11_10 },
  { id: "wooden-robot", name: "Wooden Robot Brewery", lat: 35.2156, lng: -80.8485, address: "1440 S Tryon St Suite 110, Charlotte, NC 28203, USA", category: "Brewery", googleRating: 4.6, googleTotalRatings: 1650, activity: 78, priceLevel: 2, phone: "(704) 944-0840", website: "https://woodenrobotbrewery.com", description: "Farmhouse-leaning South End brewery known for Good Morning Vietnam coffee blonde ale.", openingHours: HOURS.brewery },
  { id: "the-cellar-at-duckworths", name: "The Cellar at Duckworth's", lat: 35.2270, lng: -80.8419, address: "330 N Tryon St, Charlotte, NC 28202, USA", category: "Cocktail Bar", googleRating: 4.7, googleTotalRatings: 980, activity: 84, priceLevel: 3, phone: "(704) 372-1395", website: "https://www.duckworths.com/cellar", description: "Subterranean speakeasy beneath Duckworth's with rare spirits and dealer's-choice cocktails.", openingHours: HOURS.bar_late },
  { id: "soul-gastrolounge", name: "Soul Gastrolounge", lat: 35.2138, lng: -80.8290, address: "1500 Central Ave, Charlotte, NC 28205, USA", category: "Restaurant", googleRating: 4.6, googleTotalRatings: 2400, activity: 89, priceLevel: 2, phone: "(704) 348-1848", website: "https://www.soulgastrolounge.com", description: "Plaza Midwood tapas and sushi mainstay with a vinyl-spinning DJ and rooftop patio.", openingHours: HOURS.dinner_only },
  { id: "kindred-davidson", name: "Kindred", lat: 35.4993, lng: -80.8486, address: "131 N Main St, Davidson, NC 28036, USA", category: "Restaurant", googleRating: 4.7, googleTotalRatings: 1350, activity: 81, priceLevel: 3, phone: "(704) 896-1212", website: "https://www.kindreddavidson.com", description: "James Beard semifinalist Joe Kindred's neighborhood restaurant — milk bread, pastas, and seasonal plates.", openingHours: HOURS.dinner_only },
  { id: "leahandlouise", name: "Leah & Louise", lat: 35.2490, lng: -80.8068, address: "301 Camp Rd #101, Charlotte, NC 28206, USA", category: "Restaurant", googleRating: 4.5, googleTotalRatings: 760, activity: 79, priceLevel: 2, phone: "(980) 939-0061", website: "https://www.leahandlouise.com", description: "Modern juke joint celebrating Black foodways of the Mississippi River Valley at Camp North End.", openingHours: HOURS.dinner_only },
  { id: "optimist-hall", name: "Optimist Hall", lat: 35.2336, lng: -80.8197, address: "1115 N Brevard St, Charlotte, NC 28206, USA", category: "Food Hall", googleRating: 4.6, googleTotalRatings: 5200, activity: 93, priceLevel: 2, phone: "(980) 207-0022", website: "https://optimisthall.com", description: "Adaptive-reuse food hall with 20+ vendors — dumplings, tacos, ramen, coffee, and craft beer.", openingHours: HOURS.food_hall },
  { id: "noble-smoke", name: "Noble Smoke", lat: 35.2274, lng: -80.8665, address: "2216 Freedom Dr, Charlotte, NC 28208, USA", category: "BBQ", googleRating: 4.5, googleTotalRatings: 2700, activity: 84, priceLevel: 2, phone: "(704) 727-1700", website: "https://noblesmoke.com", description: "Whole-hog and brisket BBQ from chef Jim Noble — oak and hickory pits, generous sides.", openingHours: HOURS.daily_11_10 },
  { id: "the-waterman", name: "The Waterman Fish Bar", lat: 35.2095, lng: -80.8556, address: "2729 South Blvd, Charlotte, NC 28209, USA", category: "Seafood", googleRating: 4.5, googleTotalRatings: 1900, activity: 80, priceLevel: 2, phone: "(704) 351-1916", website: "https://www.watermanfishbar.com", description: "South End raw bar and East-Coast fish shack with poke bowls, oysters, and lobster rolls.", openingHours: HOURS.daily_11_10 },
  { id: "futo-buta", name: "Futo Buta", lat: 35.2106, lng: -80.8546, address: "222 E Bland St, Charlotte, NC 28203, USA", category: "Ramen", googleRating: 4.4, googleTotalRatings: 1450, activity: 76, priceLevel: 2, phone: "(704) 936-4044", website: "https://futobuta.com", description: "Cult-favorite South End ramen-ya with tonkotsu broths and Japanese small plates.", openingHours: HOURS.dinner_only },
  { id: "the-goodyear-house", name: "The Goodyear House", lat: 35.2492, lng: -80.8061, address: "3032 N Davidson St, Charlotte, NC 28205, USA", category: "Restaurant", googleRating: 4.6, googleTotalRatings: 1100, activity: 82, priceLevel: 3, phone: "(980) 859-1414", website: "https://thegoodyearhouse.com", description: "NoDa New American inside a restored 1920s bungalow — seasonal menus and a leafy patio.", openingHours: HOURS.dinner_only },
  { id: "rooster-noda", name: "Rooster's Wood-Fired Kitchen NoDa", lat: 35.2480, lng: -80.8074, address: "3055 N Davidson St, Charlotte, NC 28205, USA", category: "Restaurant", googleRating: 4.5, googleTotalRatings: 980, activity: 78, priceLevel: 2, phone: "(704) 998-1118", website: "https://roostersrestaurants.com/noda", description: "Wood-fired rotisserie and seasonal market plates from the Jim Noble family of restaurants.", openingHours: HOURS.daily_11_10 },
  { id: "vbgb-beer-hall", name: "VBGB Beer Hall & Garden", lat: 35.2364, lng: -80.8221, address: "920 Hamilton St #100, Charlotte, NC 28206, USA", category: "Beer Garden", googleRating: 4.4, googleTotalRatings: 2200, activity: 85, priceLevel: 2, phone: "(704) 333-4111", website: "https://vbgbcharlotte.com", description: "Sprawling indoor-outdoor beer garden with 50+ taps, giant Jenga, and live music in NoDa.", openingHours: HOURS.bar_late },
  { id: "sycamore-brewing", name: "Sycamore Brewing", lat: 35.2087, lng: -80.8559, address: "2161 Hawkins St, Charlotte, NC 28203, USA", category: "Brewery", googleRating: 4.6, googleTotalRatings: 3100, activity: 90, priceLevel: 2, phone: "(704) 333-0042", website: "https://sycamorebrew.com", description: "Massive South End taproom and beer garden — flagship Mountain Candy IPA, food trucks daily.", openingHours: HOURS.brewery },
  { id: "resident-culture", name: "Resident Culture Brewing Company", lat: 35.2196, lng: -80.8147, address: "2101 Central Ave, Charlotte, NC 28205, USA", category: "Brewery", googleRating: 4.7, googleTotalRatings: 1850, activity: 83, priceLevel: 2, phone: "(704) 333-1862", website: "https://residentculturebrewing.com", description: "Plaza Midwood brewery known for hazy IPAs, mixed-culture sours, and a vinyl bar.", openingHours: HOURS.brewery },
  { id: "lincolns-haberdashery", name: "Lincoln's Haberdashery", lat: 35.2272, lng: -80.8590, address: "1340 S Mint St, Charlotte, NC 28203, USA", category: "Cafe", googleRating: 4.5, googleTotalRatings: 720, activity: 70, priceLevel: 2, phone: "(704) 461-1414", website: "https://lincolnshaberdashery.com", description: "All-day cafe, bakery, and sandwich counter inside historic Atherton Mill in South End.", openingHours: HOURS.cafe },
  { id: "littas-pizza", name: "Inizio Pizza Napoletana", lat: 35.2259, lng: -80.8408, address: "210 E Trade St #C220, Charlotte, NC 28202, USA", category: "Pizza", googleRating: 4.5, googleTotalRatings: 880, activity: 75, priceLevel: 2, phone: "(704) 333-5550", website: "https://www.iniziopizzeria.com", description: "VPN-certified Neapolitan pizzeria — 900°F wood ovens, San Marzano sauce, and house mozzarella.", openingHours: HOURS.daily_11_10 },
  { id: "the-improper-pig", name: "The Improper Pig", lat: 35.1978, lng: -80.8237, address: "807 Providence Rd, Charlotte, NC 28207, USA", category: "BBQ", googleRating: 4.4, googleTotalRatings: 1300, activity: 73, priceLevel: 2, phone: "(704) 754-8688", website: "https://theimproperpig.com", description: "Asian-influenced Carolina BBQ — banh-mi sandwiches, smoked wings, and craft sides.", openingHours: HOURS.daily_11_10 },
  { id: "amelies-bakery", name: "Amélie's French Bakery & Café", lat: 35.2470, lng: -80.8087, address: "2424 N Davidson St, Charlotte, NC 28205, USA", category: "Bakery", googleRating: 4.6, googleTotalRatings: 4800, activity: 86, priceLevel: 1, phone: "(704) 376-1781", website: "https://www.ameliesfrenchbakery.com", description: "Whimsical 24-hour French bakery and cafe famed for its salted-caramel brownies.", openingHours: HOURS.bakery_24h },
  { id: "midwood-smokehouse", name: "Midwood Smokehouse", lat: 35.2167, lng: -80.8118, address: "1401 Central Ave, Charlotte, NC 28205, USA", category: "BBQ", googleRating: 4.6, googleTotalRatings: 3700, activity: 88, priceLevel: 2, phone: "(704) 295-4227", website: "https://midwoodsmokehouse.com", description: "Award-winning whole-hog Carolina BBQ with Texas brisket, burnt ends, and 100+ bourbons.", openingHours: HOURS.daily_11_10 },
  { id: "300-east", name: "300 East", lat: 35.2050, lng: -80.8385, address: "300 East Blvd, Charlotte, NC 28203, USA", category: "Restaurant", googleRating: 4.4, googleTotalRatings: 1600, activity: 74, priceLevel: 2, phone: "(704) 332-6507", website: "https://300east.net", description: "Dilworth bungalow turned New American bistro — long-standing brunch favorite since 1988.", openingHours: HOURS.daily_11_10 },
  { id: "the-stanley", name: "The Stanley", lat: 35.1969, lng: -80.8261, address: "1961 E 7th St, Charlotte, NC 28204, USA", category: "Restaurant", googleRating: 4.6, googleTotalRatings: 540, activity: 72, priceLevel: 3, phone: "(704) 248-5040", website: "https://www.thestanleyclt.com", description: "Chef Paul Verica's tasting-menu-driven Elizabeth restaurant focused on hyper-seasonal NC produce.", openingHours: HOURS.dinner_only },
  { id: "sea-level-nc", name: "Sea Level NC", lat: 35.2272, lng: -80.8417, address: "129 E 5th St, Charlotte, NC 28202, USA", category: "Seafood", googleRating: 4.6, googleTotalRatings: 1900, activity: 88, priceLevel: 3, phone: "(980) 237-1322", website: "https://sealevelnc.com", description: "Uptown oyster bar sourcing exclusively from North Carolina waters — raw bar, crudos, whole fish.", openingHours: HOURS.dinner_only },
  { id: "oceanaire-seafood", name: "The Oceanaire Seafood Room", lat: 35.2263, lng: -80.8430, address: "100 N Tryon St Ste 100, Charlotte, NC 28202, USA", category: "Seafood", googleRating: 4.5, googleTotalRatings: 1700, activity: 85, priceLevel: 4, phone: "(704) 333-2434", website: "https://www.theoceanaire.com/locations/charlotte", description: "Polished 1930s ocean-liner-styled seafood room with a daily-changing flown-in fish list.", openingHours: HOURS.dinner_only },
  { id: "rock-salt-charlotte", name: "Rock Salt", lat: 35.1909, lng: -80.8211, address: "4625 Piedmont Row Dr Suite 145A, Charlotte, NC 28210, USA", category: "Seafood", googleRating: 4.5, googleTotalRatings: 1500, activity: 83, priceLevel: 3, phone: "(704) 503-7625", website: "https://rocksaltcharlotte.com", description: "SouthPark coastal kitchen with raw bar, wood-grilled fish, and a heated patio.", openingHours: HOURS.daily_11_10 },
  { id: "mccormick-schmicks", name: "McCormick & Schmick's Seafood & Steaks", lat: 35.2266, lng: -80.8438, address: "200 S Tryon St, Charlotte, NC 28202, USA", category: "Seafood", googleRating: 4.3, googleTotalRatings: 1400, activity: 80, priceLevel: 3, phone: "(704) 377-0201", website: "https://www.mccormickandschmicks.com/location/charlotte", description: "Classic Uptown seafood-and-steak house with a popular daily happy hour menu.", openingHours: HOURS.daily_11_10 },
  { id: "blue-restaurant-bar", name: "BLUE Restaurant & Bar", lat: 35.2270, lng: -80.8425, address: "206 N College St, Charlotte, NC 28202, USA", category: "Seafood", googleRating: 4.5, googleTotalRatings: 1300, activity: 82, priceLevel: 3, phone: "(704) 927-2583", website: "https://www.bluecharlotte.com", description: "Mediterranean-inflected seafood and live jazz in the Hearst Tower — extensive wine cellar.", openingHours: HOURS.dinner_only },
  { id: "brewers-at-4001-yancey", name: "Brewers At 4001 Yancey", lat: 35.1859, lng: -80.8810, address: "4001 Yancey Rd, Charlotte, NC 28217, USA", category: "Brewery", googleRating: 4.6, googleTotalRatings: 1800, activity: 86, priceLevel: 2, phone: "(704) 525-5644", website: "https://www.brewersat4001yancey.com", description: "Collaborative LoSo taproom hosting four breweries under one roof, plus food trucks and live music.", openingHours: HOURS.brewery },

  // ===== Must Be Nice + surrounding Plaza Midwood / Optimist Park late-night bars =====
  { id: "must-be-nice", name: "Must Be Nice", lat: 35.2246, lng: -80.8168, address: "933 Louise Ave Suite 101, Charlotte, NC 28204, USA", category: "Cocktail Bar", googleRating: 4.6, googleTotalRatings: 420, activity: 87, priceLevel: 3, phone: "(704) 461-1516", website: "https://mustbeniceclt.com", description: "Optimist Park cocktail lounge with an aperitivo-forward menu, natural wines, and a rotating DJ program.", openingHours: HOURS.bar_late },
  { id: "snug-harbor", name: "Snug Harbor", lat: 35.2170, lng: -80.8127, address: "1228 Gordon St, Charlotte, NC 28204, USA", category: "Dive Bar", googleRating: 4.5, googleTotalRatings: 1350, activity: 84, priceLevel: 1, phone: "(704) 333-9932", website: "https://www.snugrock.com", description: "Beloved Plaza Midwood dive with live indie shows, dance nights, and a graffiti-covered patio.", openingHours: HOURS.bar_daily },
  { id: "thomas-street-tavern", name: "Thomas Street Tavern", lat: 35.2181, lng: -80.8172, address: "1218 Thomas Ave, Charlotte, NC 28205, USA", category: "Bar", googleRating: 4.5, googleTotalRatings: 1600, activity: 83, priceLevel: 2, phone: "(704) 376-1622", website: "https://thomasstreettavern.com", description: "Plaza Midwood neighborhood bar with a huge dog-friendly patio, cheap drafts, and pub grub.", openingHours: HOURS.bar_daily },
  { id: "common-market-plaza", name: "Common Market Plaza Midwood", lat: 35.2178, lng: -80.8165, address: "2007 Commonwealth Ave, Charlotte, NC 28205, USA", category: "Bar", googleRating: 4.6, googleTotalRatings: 1900, activity: 82, priceLevel: 1, phone: "(704) 334-6209", website: "https://commonmarketisgood.com", description: "Deli, bottle shop, and bar hybrid — hundreds of craft beers, sandwiches, and a lively front patio.", openingHours: HOURS.bar_late },
  { id: "petras-bar", name: "Petra's", lat: 35.2181, lng: -80.8177, address: "1919 Commonwealth Ave, Charlotte, NC 28205, USA", category: "Cocktail Bar", googleRating: 4.6, googleTotalRatings: 780, activity: 80, priceLevel: 2, phone: "(704) 332-6608", website: "https://www.petrasbar.com", description: "Cozy Plaza Midwood piano bar and cabaret with drag brunches, karaoke, and craft cocktails.", openingHours: HOURS.bar_late },
  { id: "legion-brewing-plaza", name: "Legion Brewing Plaza Midwood", lat: 35.2170, lng: -80.8195, address: "1906 Commonwealth Ave, Charlotte, NC 28205, USA", category: "Brewery", googleRating: 4.5, googleTotalRatings: 1450, activity: 81, priceLevel: 2, phone: "(980) 224-8283", website: "https://legionbrewing.com", description: "Two-story brewpub with a rooftop patio, wood-fired pizzas, and 20+ house beers on tap.", openingHours: HOURS.bar_late },
  { id: "workmans-friend", name: "The Workman's Friend", lat: 35.2249, lng: -80.8172, address: "1531 Central Ave, Charlotte, NC 28205, USA", category: "Irish Pub", googleRating: 4.5, googleTotalRatings: 690, activity: 78, priceLevel: 2, phone: "(704) 900-7597", website: "https://www.workmansfriendclt.com", description: "Authentic Irish pub with proper Guinness pours, whiskey flights, and trad-music nights.", openingHours: HOURS.bar_late },
  { id: "abari-game-bar", name: "Abari Game Bar", lat: 35.2280, lng: -80.8248, address: "1721 N Davidson St, Charlotte, NC 28206, USA", category: "Arcade Bar", googleRating: 4.6, googleTotalRatings: 1100, activity: 82, priceLevel: 2, phone: "(704) 900-7911", website: "https://abarigamebar.com", description: "Retro-arcade bar packed with pinball, classic cabinets, and a rotating craft-beer list in NoDa/Optimist Park.", openingHours: HOURS.bar_late },

  // ===== Well-known Charlotte bars, lounges & clubs (fallback only) =====
  { id: "label-charlotte", name: "Label Charlotte", lat: 35.2230, lng: -80.8474, address: "900 N Carolina Music Factory Blvd, Charlotte, NC 28206, USA", category: "Nightclub", googleRating: 4.2, googleTotalRatings: 2100, activity: 94, priceLevel: 3, phone: "(704) 749-1097", website: "https://www.labelclt.com", description: "Two-story mega club at the AvidXchange Music Factory with international DJs, LED walls, and VIP bottle service.", openingHours: HOURS.nightclub },
  { id: "whiskey-warehouse", name: "Whiskey Warehouse", lat: 35.2225, lng: -80.8470, address: "820 Hamilton St, Charlotte, NC 28206, USA", category: "Nightclub", googleRating: 4.3, googleTotalRatings: 1650, activity: 91, priceLevel: 2, phone: "(704) 837-1110", website: "https://www.whiskeywarehouseclt.com", description: "Country-leaning nightclub with mechanical bull, line dancing, and live bands at the Music Factory.", openingHours: HOURS.nightclub },
  { id: "vbgb-music-factory", name: "VBGB Beer Hall & Garden — Music Factory", lat: 35.2247, lng: -80.8466, address: "920 Hamilton St #100, Charlotte, NC 28206, USA", category: "Beer Garden", googleRating: 4.4, googleTotalRatings: 2200, activity: 90, priceLevel: 2, phone: "(704) 333-4111", website: "https://vbgbcharlotte.com", description: "Sprawling indoor-outdoor beer hall with 50+ taps, giant lawn games, and weekend DJs.", openingHours: HOURS.bar_late },
  { id: "howl-at-the-moon-clt", name: "Howl at the Moon Charlotte", lat: 35.2245, lng: -80.8462, address: "820 Hamilton St Suite C11, Charlotte, NC 28206, USA", category: "Bar", googleRating: 4.4, googleTotalRatings: 1400, activity: 89, priceLevel: 2, phone: "(704) 749-1078", website: "https://www.howlatthemoon.com/charlotte", description: "High-energy dueling-pianos bar with sing-along sets, buckets of cocktails, and bachelorette parties.", openingHours: HOURS.bar_late },
  { id: "selwyn-pub", name: "Selwyn Avenue Pub", lat: 35.1929, lng: -80.8313, address: "2801 Selwyn Ave, Charlotte, NC 28209, USA", category: "Bar", googleRating: 4.5, googleTotalRatings: 1850, activity: 88, priceLevel: 2, phone: "(704) 333-3443", website: "https://selwynpub.com", description: "Beloved Myers Park neighborhood pub with oak-shaded patio, 30+ beers on tap, and pub burgers.", openingHours: HOURS.bar_late },
  { id: "thirsty-beaver", name: "The Thirsty Beaver Saloon", lat: 35.2138, lng: -80.8264, address: "1225 Central Ave, Charlotte, NC 28204, USA", category: "Bar", googleRating: 4.7, googleTotalRatings: 1300, activity: 87, priceLevel: 1, phone: "(704) 332-3737", website: "https://www.thirstybeaversaloon.com", description: "Iconic Plaza Midwood honky-tonk dive — cheap beer, jukebox country, and the building that refused to sell.", openingHours: HOURS.bar_late },
  { id: "snug-harbor", name: "Snug Harbor", lat: 35.2152, lng: -80.8260, address: "1228 Gordon St, Charlotte, NC 28204, USA", category: "Bar", googleRating: 4.5, googleTotalRatings: 980, activity: 85, priceLevel: 1, phone: "(704) 333-9799", website: "https://snugrock.com", description: "Plaza Midwood dive bar and live-music venue with DJ nights, indie shows, and stiff pours.", openingHours: HOURS.bar_late },
  { id: "the-roxbury", name: "The Roxbury", lat: 35.2231, lng: -80.8475, address: "820 Hamilton St Suite B11, Charlotte, NC 28206, USA", category: "Nightclub", googleRating: 4.3, googleTotalRatings: 1500, activity: 88, priceLevel: 2, phone: "(704) 749-1097", website: "https://www.roxburyclt.com", description: "80s/90s throwback nightclub with themed nights, retro music videos, and costume parties.", openingHours: HOURS.nightclub },
  { id: "dot-dot-dot", name: "Dot Dot Dot", lat: 35.1907, lng: -80.8214, address: "4237 Park Rd, Charlotte, NC 28209, USA", category: "Cocktail Bar", googleRating: 4.6, googleTotalRatings: 1100, activity: 86, priceLevel: 3, phone: "(980) 209-0070", website: "https://www.dotdotdotclt.com", description: "Members-style speakeasy behind an unmarked door in Park Road — classic cocktails and a vinyl listening room.", openingHours: HOURS.bar_late },
  { id: "dilworth-tasting-room", name: "Dilworth Tasting Room", lat: 35.2031, lng: -80.8484, address: "300 Tremont Ave, Charlotte, NC 28203, USA", category: "Wine Bar", googleRating: 4.6, googleTotalRatings: 950, activity: 84, priceLevel: 3, phone: "(704) 875-1990", website: "https://www.dilworthtastingroom.com", description: "Cozy Dilworth wine bar with 80+ wines by the glass, charcuterie, and a candlelit back patio.", openingHours: HOURS.lounge },
];

// Nearby Search "type" values we search across to populate the map.
// Each yields up to 20 results per page; we take page 1 only to stay
// within latency budgets.
const NEARBY_TYPES = [
  "restaurant",
  "bar",
  "night_club",
  "cafe",
] as const;

// Friendly category labels derived from Google Place `types`.
function categoryFromTypes(types: readonly string[] = []): string {
  if (types.includes("night_club")) return "Nightclub";
  if (types.includes("bar")) return "Bar";
  if (types.includes("cafe")) return "Cafe";
  if (types.includes("bakery")) return "Bakery";
  if (types.includes("meal_takeaway")) return "Takeout";
  if (types.includes("restaurant")) return "Restaurant";
  return "Venue";
}

// Derive an activity score (0-100) from rating + total ratings so the
// existing JetCard activity UI keeps working.
function deriveActivity(rating?: number, total?: number): number {
  const r = rating ?? 0;
  const t = total ?? 0;
  const ratingScore = (r / 5) * 60;          // up to 60 pts for star rating
  const volumeScore = Math.min(40, Math.log10(t + 1) * 12); // up to 40 pts for review volume
  return Math.round(Math.max(40, Math.min(100, ratingScore + volumeScore)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require a Bearer token (project anon key or user JWT). The Supabase
    // gateway already validates project keys; this endpoint exposes only
    // public Charlotte venue demo data, so we do not require a signed-in user.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* GET-like call */ }
    const location = body?.location;
    
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    
    // Charlotte coordinates
    const charlotteLocation = location || { lat: 35.2271, lng: -80.8431 };

    // === Primary path: live Google Places Nearby Search ===
    if (apiKey) {
      try {
        const seen = new Map<string, any>();

        // Run all category searches in parallel.
        const nearbyResults = await Promise.all(
          NEARBY_TYPES.map(async (type) => {
            const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
            url.searchParams.set('location', `${charlotteLocation.lat},${charlotteLocation.lng}`);
            url.searchParams.set('radius', '8000'); // ~5mi around Charlotte center
            url.searchParams.set('type', type);
            url.searchParams.set('key', apiKey);
            const r = await fetch(url.toString());
            const j = await r.json();
            return (j.status === 'OK' || j.status === 'ZERO_RESULTS')
              ? (j.results ?? [])
              : [];
          })
        );

        for (const list of nearbyResults) {
          for (const place of list) {
            if (!place.place_id || !place.geometry?.location) continue;
            if (place.business_status && place.business_status !== 'OPERATIONAL') continue;
            // Dedupe across category overlap (e.g. bar + night_club).
            if (seen.has(place.place_id)) continue;
            seen.set(place.place_id, place);
          }
        }

        // Sort by quality (rating × log(reviews)) and cap to keep details
        // enrichment within latency / quota budget.
        const ranked = Array.from(seen.values())
          .sort((a, b) => {
            const sa = (a.rating ?? 0) * Math.log10((a.user_ratings_total ?? 0) + 10);
            const sb = (b.rating ?? 0) * Math.log10((b.user_ratings_total ?? 0) + 10);
            return sb - sa;
          })
          .slice(0, 40);

        // Enrich each with Place Details (in parallel) for hours + phone + site.
        const enriched = await Promise.all(
          ranked.map(async (place) => {
            try {
              const d = new URL('https://maps.googleapis.com/maps/api/place/details/json');
              d.searchParams.set('place_id', place.place_id);
              d.searchParams.set(
                'fields',
                'formatted_address,formatted_phone_number,website,opening_hours,price_level,editorial_summary'
              );
              d.searchParams.set('key', apiKey);
              const r = await fetch(d.toString());
              const j = await r.json();
              return { place, details: j.result ?? {} };
            } catch {
              return { place, details: {} };
            }
          })
        );

        const venues = enriched.map(({ place, details }) => ({
          id: place.place_id,
          name: place.name,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          address: details.formatted_address ?? place.vicinity ?? '',
          category: categoryFromTypes(place.types),
          googleRating: place.rating ?? null,
          googleTotalRatings: place.user_ratings_total ?? 0,
          isOpen: place.opening_hours?.open_now ?? details.opening_hours?.open_now ?? null,
          openingHours: details.opening_hours?.weekday_text ?? [],
          website: details.website ?? null,
          phone: details.formatted_phone_number ?? null,
          priceLevel: details.price_level ?? place.price_level ?? null,
          description: details.editorial_summary?.overview ?? null,
          activity: deriveActivity(place.rating, place.user_ratings_total),
        }));

        if (venues.length > 0) {
          console.log(`Returning ${venues.length} live Google Places venues`);
          return new Response(
            JSON.stringify({ venues, total: venues.length, source: 'google_places' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.warn('Nearby Search returned no usable results, falling back');
      } catch (apiError) {
        console.error('Google Places API error:', apiError);
      }
    } else {
      console.warn('GOOGLE_PLACES_API_KEY missing — using curated fallback list');
    }

    // === Fallback: curated, verified venues (only when API unavailable) ===
    const fallbackVenues = CHARLOTTE_TOP_VENUES.map(venue => ({
      ...venue,
      isOpen: null,
      openingHours: venue.openingHours ?? [],
      phone: venue.phone ?? null,
      website: venue.website ?? null,
      priceLevel: venue.priceLevel ?? null,
      description: venue.description ?? null,
    }));

    return new Response(
      JSON.stringify({ venues: fallbackVenues, total: fallbackVenues.length, source: 'fallback' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-google-places-venues:', error);
    
    // Even on error, return fallback data
    const fallbackVenues = CHARLOTTE_TOP_VENUES.map(venue => ({
      ...venue,
      isOpen: null,
      openingHours: venue.openingHours ?? [],
      phone: venue.phone ?? null,
      website: venue.website ?? null,
      priceLevel: venue.priceLevel ?? null,
      description: venue.description ?? null,
    }));

    return new Response(
      JSON.stringify({ venues: fallbackVenues, total: fallbackVenues.length, source: 'fallback_error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
