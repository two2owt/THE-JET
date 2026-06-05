import { useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeepLinkHandler {
  onDealOpen?: (dealId: string, dealData: any) => void;
  onVenueOpen?: (venueIdOrName: string) => void;
}

export const useDeepLinking = (handlers?: DeepLinkHandler) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Keep a live ref to handlers so the effect below doesn't re-fire every
  // render just because the caller passes a fresh `handlers` object literal.
  // Without this, setSelectedVenue → URL sync → searchParams change →
  // handler runs again → setSelectedVenue → infinite loop (JetCard never
  // mounts, so its buttons + nearby parking never appear).
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Track the last deal/venue param we've already handled so we don't
  // re-trigger handlers on unrelated searchParams changes.
  const lastHandledDealRef = useRef<string | null>(null);
  const lastHandledVenueRef = useRef<string | null>(null);

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

  // Handle venue deep link. The `?venue=` param is now a stable venue id,
  // but we accept legacy name-based links too — the page-level handler
  // resolves either form against the loaded venue list.
  const handleVenueDeepLink = useCallback((venueIdOrName: string) => {
    if (handlers?.onVenueOpen) {
      handlers.onVenueOpen(venueIdOrName);
    }
    // Note: we intentionally DO NOT clear the `?venue=` param so the URL
    // stays shareable — reloads or shared links will reopen the same
    // JetCard. The param is removed only when the JetCard is closed
    // (handled in the page that owns the selected-venue state).
  }, [handlers]);

  // Navigate to a deal (for use from notifications)
  const navigateToDeal = useCallback((dealId: string) => {
    navigate(`/?deal=${dealId}`);
  }, [navigate]);

  // Navigate to a venue by its stable id.
  const navigateToVenue = useCallback((venueId: string) => {
    navigate(`/?venue=${encodeURIComponent(venueId)}`);
  }, [navigate]);

  // Check for deep links on mount and URL changes. Only fire each handler
  // when the underlying param value actually changes.
  useEffect(() => {
    const dealId = searchParams.get("deal");
    const venueParam = searchParams.get("venue");

    if (dealId && dealId !== lastHandledDealRef.current) {
      lastHandledDealRef.current = dealId;
      handleDealDeepLink(dealId);
    } else if (!dealId) {
      lastHandledDealRef.current = null;
    }

    if (venueParam && venueParam !== lastHandledVenueRef.current) {
      lastHandledVenueRef.current = venueParam;
      handleVenueDeepLink(decodeURIComponent(venueParam));
    } else if (!venueParam) {
      lastHandledVenueRef.current = null;
    }
  }, [searchParams, handleDealDeepLink, handleVenueDeepLink]);

  // Listen for deep-link messages from the push service worker. When a
  // pushed notification is tapped and the tab is already open, the SW
  // posts { type: 'DEEP_LINK', url } so the SPA can navigate without
  // a full reload — this is what makes the JetCard (with parking,
  // share, and directions) open from a notification tap.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (!data || data.type !== "DEEP_LINK" || !data.url) return;
      try {
        const target = new URL(data.url, window.location.origin);
        // Same-origin only.
        if (target.origin !== window.location.origin) return;
        navigate(`${target.pathname}${target.search}${target.hash}`);
      } catch {
        // Ignore malformed URLs.
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  return {
    navigateToDeal,
    navigateToVenue,
  };
};
