import { useEffect, useCallback } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeepLinkHandler {
  onDealOpen?: (dealId: string, dealData: any) => void;
  onVenueOpen?: (venueName: string) => void;
}

export const useDeepLinking = (handlers?: DeepLinkHandler) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle deal deep link
  const handleDealDeepLink = useCallback(async (dealId: string) => {
    try {
      // Fetch the deal data
      const { data: deal, error } = await supabase
        .from("deals")
        .select("*")
        .eq("id", dealId)
        .single();

      if (error || !deal) {
        toast.error("Deal not found", {
          description: "This deal may have expired or been removed"
        });
        // Clear the deal param
        searchParams.delete("deal");
        setSearchParams(searchParams);
        return;
      }

      // Check if deal is still active
      const now = new Date();
      const expiresAt = new Date(deal.expires_at);
      const startsAt = new Date(deal.starts_at);

      if (!deal.active || expiresAt < now || startsAt > now) {
        toast.error("Deal expired", {
          description: "This deal is no longer available"
        });
        searchParams.delete("deal");
        setSearchParams(searchParams);
        return;
      }

      // Call the handler if provided
      if (handlers?.onDealOpen) {
        handlers.onDealOpen(dealId, deal);
      }

      // Show success toast
      toast.success(`${deal.title}`, {
        description: `at ${deal.venue_name}`
      });

      // Clear the deal param after handling
      searchParams.delete("deal");
      setSearchParams(searchParams);

    } catch (error) {
      console.error("Error handling deal deep link:", error);
      toast.error("Failed to load deal");
    }
  }, [handlers, searchParams, setSearchParams]);

  // Handle venue deep link
  const handleVenueDeepLink = useCallback((venueName: string) => {
    if (handlers?.onVenueOpen) {
      handlers.onVenueOpen(venueName);
    }

    // Clear the venue param after handling
    searchParams.delete("venue");
    setSearchParams(searchParams);
  }, [handlers, searchParams, setSearchParams]);

  // Navigate to a deal (for use from notifications)
  const navigateToDeal = useCallback((dealId: string) => {
    navigate(`/?deal=${dealId}`);
  }, [navigate]);

  // Navigate to a venue
  const navigateToVenue = useCallback((venueName: string) => {
    navigate(`/?venue=${encodeURIComponent(venueName)}`);
  }, [navigate]);

  // Check for deep links on mount and URL changes
  useEffect(() => {
    const dealId = searchParams.get("deal");
    const venueName = searchParams.get("venue");

    if (dealId) {
      handleDealDeepLink(dealId);
    }

    if (venueName) {
      handleVenueDeepLink(decodeURIComponent(venueName));
    }
  }, [searchParams, handleDealDeepLink, handleVenueDeepLink]);

  return {
    navigateToDeal,
    navigateToVenue,
  };
};
