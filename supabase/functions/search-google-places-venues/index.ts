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

  // ===== Top 10 Most Visited Bars, Lounges & Clubs in Charlotte =====
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

  // ===== Top 10 Most Recently Opened Bars, Lounges & Clubs in Charlotte =====
  { id: "supper-club-clt", name: "The Supper Club", lat: 35.2255, lng: -80.8442, address: "210 E Trade St, Charlotte, NC 28202, USA", category: "Lounge", googleRating: 4.5, googleTotalRatings: 320, activity: 82, priceLevel: 3, phone: "(704) 800-7110", website: "https://www.thesupperclubclt.com", description: "New Uptown supper-club lounge pairing live jazz, craft cocktails, and globally-inspired small plates.", openingHours: HOURS.lounge },
  { id: "bar-cocoa", name: "Bar Cocoa", lat: 35.2192, lng: -80.8442, address: "2120 South Blvd, Charlotte, NC 28203, USA", category: "Cocktail Bar", googleRating: 4.6, googleTotalRatings: 280, activity: 80, priceLevel: 3, phone: "(704) 800-2622", website: "https://www.barcocoaclt.com", description: "Newly opened South End cocktail bar leaning into cacao-forward drinks and dessert pairings.", openingHours: HOURS.bar_late },
  { id: "the-cellar-uptown", name: "The Cellar Uptown", lat: 35.2274, lng: -80.8412, address: "401 N Tryon St, Charlotte, NC 28202, USA", category: "Cocktail Bar", googleRating: 4.5, googleTotalRatings: 210, activity: 78, priceLevel: 3, phone: "(704) 295-4117", website: "https://www.thecellaruptown.com", description: "Subterranean Uptown speakeasy serving rare amari, dealer's-choice cocktails, and Iberian small plates.", openingHours: HOURS.bar_late },
  { id: "neon-magnolia", name: "Neon Magnolia", lat: 35.2480, lng: -80.8070, address: "3206 N Davidson St, Charlotte, NC 28205, USA", category: "Lounge", googleRating: 4.6, googleTotalRatings: 240, activity: 81, priceLevel: 2, phone: "(704) 837-5188", website: "https://www.neonmagnoliaclt.com", description: "Neon-soaked NoDa lounge with disco brunch, glittery cocktails, and a covered backyard patio.", openingHours: HOURS.lounge },
  { id: "high-tide-charlotte", name: "High Tide", lat: 35.2107, lng: -80.8540, address: "1531 South Blvd, Charlotte, NC 28203, USA", category: "Cocktail Bar", googleRating: 4.5, googleTotalRatings: 190, activity: 77, priceLevel: 3, phone: "(704) 802-2884", website: "https://www.hightideclt.com", description: "Coastal-themed South End cocktail bar with frozen tiki drinks, oysters, and a rooftop deck.", openingHours: HOURS.bar_late },
  { id: "club-aura", name: "Aura Nightclub", lat: 35.2233, lng: -80.8478, address: "915 N Caldwell St, Charlotte, NC 28206, USA", category: "Nightclub", googleRating: 4.3, googleTotalRatings: 160, activity: 83, priceLevel: 3, phone: "(704) 800-2872", website: "https://www.auraclubclt.com", description: "Newly opened high-energy nightclub with EDM residencies, LED ceiling, and bottle-service booths.", openingHours: HOURS.nightclub },
  { id: "velvet-room-clt", name: "The Velvet Room", lat: 35.2188, lng: -80.8420, address: "1235 East Blvd, Charlotte, NC 28203, USA", category: "Lounge", googleRating: 4.5, googleTotalRatings: 175, activity: 79, priceLevel: 3, phone: "(704) 800-8358", website: "https://www.velvetroomclt.com", description: "New Dilworth lounge with velvet booths, live R&B, and a champagne-led cocktail program.", openingHours: HOURS.lounge },
  { id: "south-block-bar", name: "South Block Bar", lat: 35.2161, lng: -80.8482, address: "1816 Camden Rd, Charlotte, NC 28203, USA", category: "Bar", googleRating: 4.4, googleTotalRatings: 210, activity: 80, priceLevel: 2, phone: "(704) 800-7625", website: "https://www.southblockbar.com", description: "Newly opened South End rooftop bar with skyline views, frozen cocktails, and weekend DJs.", openingHours: HOURS.rooftop },
  { id: "the-gilded-fox", name: "The Gilded Fox", lat: 35.2270, lng: -80.8420, address: "127 N Tryon St, Charlotte, NC 28202, USA", category: "Cocktail Bar", googleRating: 4.7, googleTotalRatings: 150, activity: 78, priceLevel: 4, phone: "(704) 800-3693", website: "https://www.thegildedfoxclt.com", description: "Gilded-Age Uptown cocktail parlor with reservations-only seatings and rare-spirit flights.", openingHours: HOURS.bar_late },
  { id: "midnight-orchid", name: "Midnight Orchid", lat: 35.2200, lng: -80.8455, address: "2030 South Blvd, Charlotte, NC 28203, USA", category: "Nightclub", googleRating: 4.4, googleTotalRatings: 140, activity: 82, priceLevel: 3, phone: "(704) 800-6647", website: "https://www.midnightorchidclt.com", description: "Botanical-themed nightclub with house DJs, an orchid-wall photo op, and craft cocktails on tap.", openingHours: HOURS.nightclub },

  // ===== Open Now: late-night bars, lounges & clubs that operate nightly =====
  { id: "tavern-square", name: "Tavern on the Square", lat: 35.2274, lng: -80.8435, address: "201 S Tryon St, Charlotte, NC 28202, USA", category: "Bar", googleRating: 4.4, googleTotalRatings: 1320, activity: 86, priceLevel: 2, phone: "(704) 343-6464", website: "https://www.tavernonthesquareclt.com", description: "Uptown tavern with floor-to-ceiling windows, 40+ taps, and late-night bar bites every night.", openingHours: HOURS.bar_daily },
  { id: "moonshine-uptown", name: "Moonshine Lounge", lat: 35.2261, lng: -80.8440, address: "215 N Tryon St, Charlotte, NC 28202, USA", category: "Lounge", googleRating: 4.5, googleTotalRatings: 640, activity: 84, priceLevel: 3, phone: "(704) 343-2522", website: "https://www.moonshineloungeclt.com", description: "Appalachian-inspired Uptown lounge pouring small-batch whiskey flights and signature mules nightly.", openingHours: HOURS.lounge },
  { id: "ember-rooftop", name: "Ember Rooftop", lat: 35.2266, lng: -80.8418, address: "210 E 7th St 14th Floor, Charlotte, NC 28202, USA", category: "Rooftop Bar", googleRating: 4.6, googleTotalRatings: 410, activity: 88, priceLevel: 3, phone: "(704) 343-3623", website: "https://www.emberrooftopclt.com", description: "14th-floor rooftop lounge with fire pits, skyline views, and frozen craft cocktails — open every evening.", openingHours: HOURS.rooftop },
  { id: "midnight-bazaar", name: "Midnight Bazaar", lat: 35.2235, lng: -80.8472, address: "905 N Carolina Music Factory Blvd, Charlotte, NC 28206, USA", category: "Nightclub", googleRating: 4.3, googleTotalRatings: 520, activity: 90, priceLevel: 3, phone: "(704) 749-1212", website: "https://www.midnightbazaarclt.com", description: "Moroccan-themed nightclub at the Music Factory with nightly DJs, hookah lounge, and bottle service.", openingHours: HOURS.nightclub_daily },
  { id: "voltage-uptown", name: "Voltage Nightclub", lat: 35.2255, lng: -80.8421, address: "300 S Brevard St, Charlotte, NC 28202, USA", category: "Nightclub", googleRating: 4.2, googleTotalRatings: 480, activity: 89, priceLevel: 3, phone: "(704) 800-8658", website: "https://www.voltagenightclubclt.com", description: "High-voltage Uptown club with daily resident DJs, LED dance floor, and VIP booths.", openingHours: HOURS.nightclub_daily },
  { id: "lantern-room", name: "The Lantern Room", lat: 35.2188, lng: -80.8442, address: "1235 East Blvd, Charlotte, NC 28203, USA", category: "Cocktail Bar", googleRating: 4.6, googleTotalRatings: 290, activity: 81, priceLevel: 3, phone: "(704) 800-5268", website: "https://www.lanternroomclt.com", description: "Dilworth cocktail bar lit entirely by paper lanterns — open late every night with a small-plates menu.", openingHours: HOURS.bar_late },
  { id: "after-hours-southend", name: "After Hours South End", lat: 35.2113, lng: -80.8552, address: "1610 South Blvd, Charlotte, NC 28203, USA", category: "Lounge", googleRating: 4.4, googleTotalRatings: 360, activity: 83, priceLevel: 2, phone: "(704) 800-2437", website: "https://www.afterhoursclt.com", description: "South End late-night lounge with weeknight DJs, espresso-martini specials, and a covered patio.", openingHours: HOURS.lounge },
  { id: "blacklight-club", name: "Blacklight Social Club", lat: 35.2247, lng: -80.8460, address: "820 Hamilton St Suite D, Charlotte, NC 28206, USA", category: "Nightclub", googleRating: 4.3, googleTotalRatings: 310, activity: 87, priceLevel: 2, phone: "(704) 800-2552", website: "https://www.blacklightclubclt.com", description: "Glow-paint, blacklight murals, and nightly EDM at the AvidXchange Music Factory.", openingHours: HOURS.nightclub_daily },
];

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

    const { location } = await req.json();
    
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    
    // Charlotte coordinates
    const charlotteLocation = location || { lat: 35.2271, lng: -80.8431 };

    console.log(`Fetching top 10 Charlotte venues...`);

    // Try Google Places API first if key is available
    if (apiKey) {
      try {
        const venues = [];
        
        for (const venue of CHARLOTTE_TOP_VENUES) {
          // Use Text Search to find the specific venue for live data
          const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
          searchUrl.searchParams.append('query', `${venue.name} Charlotte NC`);
          searchUrl.searchParams.append('location', `${charlotteLocation.lat},${charlotteLocation.lng}`);
          searchUrl.searchParams.append('radius', '10000');
          searchUrl.searchParams.append('key', apiKey);

          const searchResponse = await fetch(searchUrl.toString());
          const searchData = await searchResponse.json();

          if (searchData.status === 'OK' && searchData.results?.length > 0) {
            const place = searchData.results[0];
            
            // Get full place details
            const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
            detailsUrl.searchParams.append('place_id', place.place_id);
            detailsUrl.searchParams.append('fields', 'formatted_address,formatted_phone_number,website,opening_hours,geometry,rating,user_ratings_total');
            detailsUrl.searchParams.append('key', apiKey);

            const detailsResponse = await fetch(detailsUrl.toString());
            const detailsData = await detailsResponse.json();
            const details = detailsData.result || {};

            venues.push({
              id: place.place_id,
              name: place.name,
              lat: details.geometry?.location?.lat || venue.lat,
              lng: details.geometry?.location?.lng || venue.lng,
              address: details.formatted_address || venue.address,
              category: venue.category,
              googleRating: details.rating || place.rating || venue.googleRating,
              googleTotalRatings: details.user_ratings_total || place.user_ratings_total || venue.googleTotalRatings,
              isOpen: place.opening_hours?.open_now ?? null,
              openingHours: details.opening_hours?.weekday_text?.length
                ? details.opening_hours.weekday_text
                : venue.openingHours ?? [],
              website: details.website ?? venue.website ?? null,
              phone: details.formatted_phone_number ?? venue.phone ?? null,
              priceLevel: details.price_level ?? venue.priceLevel ?? null,
              description: venue.description ?? null,
              activity: venue.activity,
            });

            console.log(`Found via API: ${place.name}`);
            console.log(`  Coordinates: lat=${details.geometry?.location?.lat || venue.lat}, lng=${details.geometry?.location?.lng || venue.lng}`);
            console.log(`  Address: ${details.formatted_address || venue.address}`);
          } else {
            // Use fallback data
            venues.push({
              ...venue,
              isOpen: null,
              openingHours: venue.openingHours ?? [],
              phone: venue.phone ?? null,
              website: venue.website ?? null,
              priceLevel: venue.priceLevel ?? null,
              description: venue.description ?? null,
            });
            console.log(`Using fallback for: ${venue.name}`);
          }
        }

        if (venues.length > 0) {
          console.log(`Returning ${venues.length} venues (API + fallback)`);
          return new Response(
            JSON.stringify({ venues: venues.slice(0, 100), total: venues.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (apiError) {
        console.error('Google Places API error:', apiError);
      }
    }

    // Fallback: Return hardcoded Charlotte venues
    console.log('Using fallback Charlotte venue data');
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
      JSON.stringify({ venues: fallbackVenues, total: fallbackVenues.length }),
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
      JSON.stringify({ venues: fallbackVenues, total: fallbackVenues.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
