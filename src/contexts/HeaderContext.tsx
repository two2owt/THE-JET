import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import type { Venue } from "@/types/venue";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database['public']['Tables']['deals']['Row'];

interface HeaderConfig {
  venues: Venue[];
  deals: Deal[];
  onVenueSelect: (venue: Venue | string) => void;
  isLoading?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  cityName?: string;
  hideSearch: boolean;
}

interface HeaderContextType extends HeaderConfig {
  setHeaderConfig: (config: Partial<HeaderConfig>) => void;
}

const defaultConfig: HeaderConfig = {
  venues: [],
  deals: [],
  onVenueSelect: () => {},
  isLoading: false,
  lastUpdated: null,
  onRefresh: undefined,
  cityName: undefined,
  hideSearch: false,
};

const HeaderContext = createContext<HeaderContextType>({
  ...defaultConfig,
  setHeaderConfig: () => {},
});

export const useHeaderContext = () => useContext(HeaderContext);

/**
 * Hook for pages to configure the header.
 * Call this in your page component to set venues, deals, search handler, etc.
 */
export const useHeaderConfig = () => {
  const { setHeaderConfig } = useContext(HeaderContext);
  return setHeaderConfig;
};

interface HeaderProviderProps {
  children: ReactNode;
}

export const HeaderProvider = ({ children }: HeaderProviderProps) => {
  const [config, setConfig] = useState<HeaderConfig>(defaultConfig);

  const setHeaderConfig = useCallback((partial: Partial<HeaderConfig>) => {
    setConfig(prev => {
      // Shallow-compare each key to avoid unnecessary state updates (and infinite loops)
      const keys = Object.keys(partial) as (keyof HeaderConfig)[];
      const hasChange = keys.some(k => prev[k] !== partial[k]);
      return hasChange ? { ...prev, ...partial } : prev;
    });
  }, []);

  // Memoize the full context value so consumers only re-render when config actually changes,
  // not on every HeaderProvider render. This prevents the infinite-loop caused by
  // `{ ...config, setHeaderConfig }` creating a new object reference each render.
  const contextValue = useMemo(
    () => ({ ...config, setHeaderConfig }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, setHeaderConfig]
  );

  return (
    <HeaderContext.Provider value={contextValue}>
      {children}
    </HeaderContext.Provider>
  );
};
