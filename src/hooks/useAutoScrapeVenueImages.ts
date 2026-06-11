import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useAutoScrapeVenueImages = (enabled: boolean = true) => {
  const [isScrapingActive, setIsScrapingActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const scrapeImagesForDeals = async () => {
      try {
        // Find deals with website_url but no image_url
        const { data: dealsToScrape, error } = await supabase
          .from('deals')
          .select('id, venue_name, website_url')
          .not('website_url', 'is', null)
          .is('image_url', null)
          .eq('active', true)
          .limit(5); // Process 5 at a time to avoid overwhelming the API

        if (error) throw error;

        if (dealsToScrape && dealsToScrape.length > 0) {
          setIsScrapingActive(true);
          console.log(`Found ${dealsToScrape.length} deals to scrape images for`);

          // Process deals one at a time
          for (const deal of dealsToScrape) {
            try {
              console.log(`Scraping image for ${deal.venue_name}...`);
              
              const { data, error: functionError } = await supabase.functions.invoke(
                'scrape-venue-images',
                {
                  body: {
                    dealId: deal.id,
                    websiteUrl: deal.website_url,
                  },
                }
              );

              if (functionError) {
                console.error(`Failed to scrape ${deal.venue_name}:`, functionError);
              } else if (data?.imageUrl) {
                console.log(`Successfully scraped image for ${deal.venue_name}`);
              }

              // Small delay between requests
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err) {
              console.error(`Error scraping ${deal.venue_name}:`, err);
            }
          }

          setIsScrapingActive(false);

          toast.success("Images Updated", {
            description: `Scraped images for ${dealsToScrape.length} venues`,
          });
        }
      } catch (error) {
        console.error('Error in auto-scrape:', error);
        setIsScrapingActive(false);
      }
    };

    // Run once on mount
    scrapeImagesForDeals();

    // Set up realtime listener for new deals
    const channel = supabase
      .channel('new-deals-scraper')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deals',
          filter: 'image_url=is.null',
        },
        async (payload) => {
          const newDeal = payload.new as any;
          if (newDeal.website_url && !newDeal.image_url) {
            console.log('New deal detected, scraping image...');
            try {
              await supabase.functions.invoke('scrape-venue-images', {
                body: {
                  dealId: newDeal.id,
                  websiteUrl: newDeal.website_url,
                },
              });
            } catch (err) {
              console.error('Error scraping new deal:', err);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  const manualScrape = async (dealId: string, websiteUrl: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-venue-images', {
        body: { dealId, websiteUrl },
      });

      if (error) throw error;

      toast.success("Image Scraped", {
        description: "Venue image has been updated",
      });

      return data;
    } catch (error) {
      console.error('Manual scrape error:', error);
      toast.error("Scrape Failed", {
        description: "Could not fetch venue image",
      });
      throw error;
    }
  };

  return { isScrapingActive, manualScrape };
};
