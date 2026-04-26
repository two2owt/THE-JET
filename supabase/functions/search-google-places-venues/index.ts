import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "search-google-places-venues";
logVersion(FUNCTION_NAME);

// Popular venues in and around Charlotte, NC with verified Google Places addresses.
// Business hours (openingHours / isOpen) are enriched live from Google Places below,
// and the client uses `useOpenVenues` to hide markers for venues that are currently closed.
const CHARLOTTE_TOP_VENUES = [
  {
    id: "merchant-trade",
    name: "Merchant & Trade",
    lat: 35.2271,
    lng: -80.8431,
    address: "201 S College St 19th floor, Charlotte, NC 28244, USA",
    category: "Rooftop Bar",
    googleRating: 4.5,
    googleTotalRatings: 1200,
    activity: 95,
  },
  {
    id: "punch-room",
    name: "The Punch Room",
    lat: 35.2269,
    lng: -80.8405,
    address: "100 W Trade St, Charlotte, NC 28202, USA",
    category: "Cocktail Bar",
    googleRating: 4.7,
    googleTotalRatings: 890,
    activity: 88,
  },
  {
    id: "heirloom",
    name: "Heirloom Restaurant",
    lat: 35.2163,
    lng: -80.8482,
    address: "8470 Bellhaven Blvd, Charlotte, NC 28216, USA",
    category: "Restaurant",
    googleRating: 4.6,
    googleTotalRatings: 1450,
    activity: 92,
  },
  {
    id: "supperland",
    name: "Supperland",
    lat: 35.2381,
    lng: -80.8237,
    address: "1212 N Davidson St, Charlotte, NC 28206, USA",
    category: "Restaurant",
    googleRating: 4.5,
    googleTotalRatings: 980,
    activity: 87,
  },
  {
    id: "haberdish",
    name: "Haberdish",
    lat: 35.2488,
    lng: -80.8067,
    address: "3106 N Davidson St, Charlotte, NC 28205, USA",
    category: "Restaurant",
    googleRating: 4.4,
    googleTotalRatings: 1100,
    activity: 85,
  },
  {
    id: "seoul-food",
    name: "Seoul Food Meat Company",
    lat: 35.2188,
    lng: -80.8441,
    address: "2001 South Blvd Suite 100, Charlotte, NC 28203, USA",
    category: "Restaurant",
    googleRating: 4.6,
    googleTotalRatings: 2100,
    activity: 83,
  },
  {
    id: "crunkleton",
    name: "The Crunkleton",
    lat: 35.2193,
    lng: -80.8137,
    address: "1957 E 7th St, Charlotte, NC 28204, USA",
    category: "Cocktail Bar",
    googleRating: 4.7,
    googleTotalRatings: 650,
    activity: 80,
  },
  {
    id: "fahrenheit",
    name: "Fahrenheit",
    lat: 35.2272,
    lng: -80.8394,
    address: "222 S Caldwell St, Charlotte, NC 28202, USA",
    category: "Restaurant",
    googleRating: 4.4,
    googleTotalRatings: 1800,
    activity: 90,
  },
  {
    id: "angelines",
    name: "Angeline's",
    lat: 35.2257,
    lng: -80.8401,
    address: "125 W Trade St, Charlotte, NC 28202, USA",
    category: "Restaurant",
    googleRating: 4.5,
    googleTotalRatings: 720,
    activity: 82,
  },
  {
    id: "wooden-robot",
    name: "Wooden Robot Brewery",
    lat: 35.2156,
    lng: -80.8485,
    address: "1440 S Tryon St Suite 110, Charlotte, NC 28203, USA",
    category: "Brewery",
    googleRating: 4.6,
    googleTotalRatings: 1650,
    activity: 78,
  },
  // --- Expanded Charlotte metro venues ---
  {
    id: "the-cellar-at-duckworths",
    name: "The Cellar at Duckworth's",
    lat: 35.2270,
    lng: -80.8419,
    address: "330 N Tryon St, Charlotte, NC 28202, USA",
    category: "Cocktail Bar",
    googleRating: 4.7,
    googleTotalRatings: 980,
    activity: 84,
  },
  {
    id: "soul-gastrolounge",
    name: "Soul Gastrolounge",
    lat: 35.2138,
    lng: -80.8290,
    address: "1500 Central Ave, Charlotte, NC 28205, USA",
    category: "Restaurant",
    googleRating: 4.6,
    googleTotalRatings: 2400,
    activity: 89,
  },
  {
    id: "kindred-davidson",
    name: "Kindred",
    lat: 35.4993,
    lng: -80.8486,
    address: "131 N Main St, Davidson, NC 28036, USA",
    category: "Restaurant",
    googleRating: 4.7,
    googleTotalRatings: 1350,
    activity: 81,
  },
  {
    id: "leahandlouise",
    name: "Leah & Louise",
    lat: 35.2490,
    lng: -80.8068,
    address: "301 Camp Rd #101, Charlotte, NC 28206, USA",
    category: "Restaurant",
    googleRating: 4.5,
    googleTotalRatings: 760,
    activity: 79,
  },
  {
    id: "optimist-hall",
    name: "Optimist Hall",
    lat: 35.2336,
    lng: -80.8197,
    address: "1115 N Brevard St, Charlotte, NC 28206, USA",
    category: "Food Hall",
    googleRating: 4.6,
    googleTotalRatings: 5200,
    activity: 93,
  },
  {
    id: "noble-smoke",
    name: "Noble Smoke",
    lat: 35.2274,
    lng: -80.8665,
    address: "2216 Freedom Dr, Charlotte, NC 28208, USA",
    category: "BBQ",
    googleRating: 4.5,
    googleTotalRatings: 2700,
    activity: 84,
  },
  {
    id: "the-waterman",
    name: "The Waterman Fish Bar",
    lat: 35.2095,
    lng: -80.8556,
    address: "2729 South Blvd, Charlotte, NC 28209, USA",
    category: "Seafood",
    googleRating: 4.5,
    googleTotalRatings: 1900,
    activity: 80,
  },
  {
    id: "futo-buta",
    name: "Futo Buta",
    lat: 35.2106,
    lng: -80.8546,
    address: "222 E Bland St, Charlotte, NC 28203, USA",
    category: "Ramen",
    googleRating: 4.4,
    googleTotalRatings: 1450,
    activity: 76,
  },
  {
    id: "the-goodyear-house",
    name: "The Goodyear House",
    lat: 35.2492,
    lng: -80.8061,
    address: "3032 N Davidson St, Charlotte, NC 28205, USA",
    category: "Restaurant",
    googleRating: 4.6,
    googleTotalRatings: 1100,
    activity: 82,
  },
  {
    id: "rooster-noda",
    name: "Rooster's Wood-Fired Kitchen NoDa",
    lat: 35.2480,
    lng: -80.8074,
    address: "3055 N Davidson St, Charlotte, NC 28205, USA",
    category: "Restaurant",
    googleRating: 4.5,
    googleTotalRatings: 980,
    activity: 78,
  },
  {
    id: "vbgb-beer-hall",
    name: "VBGB Beer Hall & Garden",
    lat: 35.2364,
    lng: -80.8221,
    address: "920 Hamilton St #100, Charlotte, NC 28206, USA",
    category: "Beer Garden",
    googleRating: 4.4,
    googleTotalRatings: 2200,
    activity: 85,
  },
  {
    id: "sycamore-brewing",
    name: "Sycamore Brewing",
    lat: 35.2087,
    lng: -80.8559,
    address: "2161 Hawkins St, Charlotte, NC 28203, USA",
    category: "Brewery",
    googleRating: 4.6,
    googleTotalRatings: 3100,
    activity: 90,
  },
  {
    id: "resident-culture",
    name: "Resident Culture Brewing Company",
    lat: 35.2196,
    lng: -80.8147,
    address: "2101 Central Ave, Charlotte, NC 28205, USA",
    category: "Brewery",
    googleRating: 4.7,
    googleTotalRatings: 1850,
    activity: 83,
  },
  {
    id: "lincolns-haberdashery",
    name: "Lincoln's Haberdashery",
    lat: 35.2272,
    lng: -80.8590,
    address: "1340 S Mint St, Charlotte, NC 28203, USA",
    category: "Cafe",
    googleRating: 4.5,
    googleTotalRatings: 720,
    activity: 70,
  },
  {
    id: "littas-pizza",
    name: "Inizio Pizza Napoletana",
    lat: 35.2259,
    lng: -80.8408,
    address: "210 E Trade St #C220, Charlotte, NC 28202, USA",
    category: "Pizza",
    googleRating: 4.5,
    googleTotalRatings: 880,
    activity: 75,
  },
  {
    id: "the-improper-pig",
    name: "The Improper Pig",
    lat: 35.1978,
    lng: -80.8237,
    address: "807 Providence Rd, Charlotte, NC 28207, USA",
    category: "BBQ",
    googleRating: 4.4,
    googleTotalRatings: 1300,
    activity: 73,
  },
  {
    id: "amelies-bakery",
    name: "Amélie's French Bakery & Café",
    lat: 35.2470,
    lng: -80.8087,
    address: "2424 N Davidson St, Charlotte, NC 28205, USA",
    category: "Bakery",
    googleRating: 4.6,
    googleTotalRatings: 4800,
    activity: 86,
  },
  {
    id: "midwood-smokehouse",
    name: "Midwood Smokehouse",
    lat: 35.2167,
    lng: -80.8118,
    address: "1401 Central Ave, Charlotte, NC 28205, USA",
    category: "BBQ",
    googleRating: 4.6,
    googleTotalRatings: 3700,
    activity: 88,
  },
  {
    id: "300-east",
    name: "300 East",
    lat: 35.2050,
    lng: -80.8385,
    address: "300 East Blvd, Charlotte, NC 28203, USA",
    category: "Restaurant",
    googleRating: 4.4,
    googleTotalRatings: 1600,
    activity: 74,
  },
  {
    id: "the-stanley",
    name: "The Stanley",
    lat: 35.1969,
    lng: -80.8261,
    address: "1961 E 7th St, Charlotte, NC 28204, USA",
    category: "Restaurant",
    googleRating: 4.6,
    googleTotalRatings: 540,
    activity: 72,
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
              openingHours: details.opening_hours?.weekday_text || [],
              website: details.website,
              phone: details.formatted_phone_number,
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
              openingHours: [],
            });
            console.log(`Using fallback for: ${venue.name}`);
          }
        }

        if (venues.length > 0) {
          console.log(`Returning ${venues.length} venues (API + fallback)`);
          return new Response(
            JSON.stringify({ venues: venues.slice(0, 10), total: venues.length }),
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
      openingHours: [],
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
      openingHours: [],
    }));

    return new Response(
      JSON.stringify({ venues: fallbackVenues, total: fallbackVenues.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
