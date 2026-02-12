import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOKEN_CACHE_KEY = 'mapbox_token_cache_v2';
const TOKEN_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface CachedToken {
  token: string;
  timestamp: number;
}

// Synchronous cache check - called before React render for fastest possible load
export const getMapboxTokenFromCache = (): string | null => {
  return getCachedToken();
};

// Check for preloaded token from HTML shell (set before React hydration)
const getPreloadedToken = (): string | null => {
  if (typeof window !== 'undefined' && (window as any).__mapboxToken) {
    return (window as any).__mapboxToken;
  }
  return null;
};

// Use both localStorage and sessionStorage for better mobile persistence
const getCachedToken = (): string | null => {
  try {
    // First check for preloaded token from HTML shell
    const preloaded = getPreloadedToken();
    if (preloaded) {
      return preloaded;
    }
    
    // Try localStorage first (persists across sessions)
    let cached = localStorage.getItem(TOKEN_CACHE_KEY);

    // Fallback to sessionStorage
    if (!cached) {
      cached = sessionStorage.getItem(TOKEN_CACHE_KEY);
    }

    // Clear legacy cache key so a rotated token takes effect immediately
    if (!cached) {
      localStorage.removeItem('mapbox_token_cache');
      sessionStorage.removeItem('mapbox_token_cache');
      return null;
    }

    const { token, timestamp }: CachedToken = JSON.parse(cached);
    const isExpired = Date.now() - timestamp > TOKEN_CACHE_DURATION;

    if (isExpired || typeof token !== 'string' || !token.startsWith('pk.')) {
      localStorage.removeItem(TOKEN_CACHE_KEY);
      sessionStorage.removeItem(TOKEN_CACHE_KEY);
      return null;
    }

    return token;
  } catch {
    return null;
  }
};

const setCachedToken = (token: string): void => {
  try {
    const cache: CachedToken = { token, timestamp: Date.now() };
    // Store in both for redundancy on mobile
    localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache));
    sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
};

interface UseMapboxTokenOptions {
  enabled?: boolean;
}

export const useMapboxToken = (options: UseMapboxTokenOptions = {}) => {
  const { enabled = true } = options;
  
  // Initialize synchronously from cache
  const initialCachedToken = getCachedToken();
  const [token, setToken] = useState<string>(initialCachedToken || "");
  const [loading, setLoading] = useState(!initialCachedToken && enabled);
  const [error, setError] = useState<string | null>(null);
  const fetchStartedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchToken = useCallback(async () => {
    // Check cache first (includes preloaded token from HTML shell)
    const cachedToken = getCachedToken();
    if (cachedToken) {
      console.log('useMapboxToken: Using cached/preloaded token');
      setToken(cachedToken);
      setLoading(false);
      setError(null);
      return;
    }
    
    // Check if HTML shell started a fetch we can await
    if (typeof window !== 'undefined' && (window as any).__mapboxTokenPromise) {
      try {
        await (window as any).__mapboxTokenPromise;
        const preloaded = getPreloadedToken();
        if (preloaded) {
          console.log('useMapboxToken: Using preloaded token from HTML shell');
          setToken(preloaded);
          setLoading(false);
          setError(null);
          return;
        }
      } catch {
        // Continue to normal fetch
      }
    }
    
    console.log('useMapboxToken: No cached token, fetching from edge function...');
    setLoading(true);
    setError(null);
    
    // Create a race between the fetch and a timeout
    const fetchWithTimeout = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const { data, error: fetchError } = await supabase.functions.invoke("get-mapbox-token", {
          // @ts-ignore - abort signal is supported but not in types
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (fetchError) {
          console.error('useMapboxToken: Error fetching token:', fetchError);
          throw fetchError;
        }
        
        if (!data || !data.token) {
          console.error('useMapboxToken: No token received from edge function');
          throw new Error('No token received from server');
        }

        if (typeof data.token !== 'string' || !data.token.startsWith('pk.')) {
          console.error('useMapboxToken: Invalid token received');
          throw new Error('Invalid Mapbox public token');
        }
        
        console.log('useMapboxToken: Successfully fetched token');
        setCachedToken(data.token);
        setToken(data.token);
        setError(null);
      } catch (err: any) {
        clearTimeout(timeoutId);
        
        if (err?.name === 'AbortError') {
          console.error('useMapboxToken: Request timed out');
          throw new Error('Request timed out');
        }
        throw err;
      }
    };

    try {
      await fetchWithTimeout();
    } catch (err: any) {
      console.error('useMapboxToken: Fetch failed:', err);
      const message = err?.message || 'Unknown error';
      if (message.includes('timed out')) {
        setError("Map service is taking too long. Please refresh the page.");
      } else if (message.includes('MAPBOX_PUBLIC_TOKEN not configured')) {
        setError("Map is not configured. Please contact support.");
      } else {
        setError("Failed to load map. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch token on mount if not cached
  useEffect(() => {
    if (!enabled) return;
    if (token) return; // Already have a token
    if (fetchStartedRef.current) return; // Already started fetching
    
    fetchStartedRef.current = true;
    
    // Set a backup timeout - if fetch takes too long, show an error instead of infinite loading
    // This is a safety net in case the fetch promise never resolves
    timeoutRef.current = setTimeout(() => {
      if (loading && !token) {
        console.warn('useMapboxToken: Backup timeout triggered after 12 seconds, retrying silently');
        fetchStartedRef.current = false;
        fetchToken();
      }
    }, 12000);
    
    fetchToken().finally(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    });
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, token, fetchToken, loading]);

  return { token, loading: enabled ? loading : false, error, refetch: fetchToken };
};
