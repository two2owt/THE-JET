import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface VenueImage {
  venue_name: string;
  image_url: string | null;
}

interface CachedVenueImages {
  data: [string, string][]; // Array of [venue_name, image_url] tuples
  timestamp: number;
}

const CACHE_KEY = "venue_images_cache";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

export const useVenueImages = () => {
  const [venueImages, setVenueImages] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Small defer to not block critical render, but still load early
    const timer = setTimeout(() => {
      loadVenueImages();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const loadVenueImages = async () => {
    try {
      // Check localStorage cache first
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp }: CachedVenueImages = JSON.parse(cached);
        const isExpired = Date.now() - timestamp > CACHE_DURATION;

        if (!isExpired) {
          // Use cached data
          const imageMap = new Map<string, string>(data);
          setVenueImages(imageMap);
          setLoading(false);
          return;
        }
      }

      // Fetch from database if no valid cache
      const { data, error } = await supabase
        .from("deals")
        .select("venue_name, image_url")
        .not("image_url", "is", null)
        .eq("active", true);

      if (error) throw error;

      const imageMap = new Map<string, string>();
      data?.forEach((deal: VenueImage) => {
        if (deal.image_url && !imageMap.has(deal.venue_name)) {
          imageMap.set(deal.venue_name, deal.image_url);
        }
      });

      // Cache the results
      const cacheData: CachedVenueImages = {
        data: Array.from(imageMap.entries()),
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setVenueImages(imageMap);
    } catch (error) {
      console.error("Error loading venue images:", error);
    } finally {
      setLoading(false);
    }
  };

  const getVenueImage = (venueName: string): string | undefined => {
    return venueImages.get(venueName);
  };

  return { venueImages, getVenueImage, loading };
};
