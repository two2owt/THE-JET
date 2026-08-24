import { lazy, Suspense, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import type { Venue } from "@/types/venue";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

const SearchResults = lazy(() =>
  import("@/components/SearchResults").then((m) => ({
    default: m.SearchResults,
  })),
);

const MAX_QUERY_LENGTH = 100;

export interface HeaderSearchProps {
  /** Header mount transition flag (drives fade-in). */
  mounted: boolean;
  /** True when the viewport is mobile-sized. */
  isMobile: boolean;
  /** Current query string (controlled by parent). */
  query: string;
  /** Whether the results dropdown is visible. */
  showResults: boolean;
  /** Data passed through to SearchResults. */
  venues: Venue[];
  deals: Deal[];
  /** Underlying dataset is still loading. */
  isLoading?: boolean;
  /** Query is still settling through the debounce. */
  isSearching?: boolean;
  /** Failed data load message, shown as the panel's error state. */
  error?: string | null;
  /** Retry handler for the error state. */
  onRetry?: () => void;
  onVenueSelect: (venue: Venue | string) => void;
  /** Setters / handlers wired from parent. */
  onQueryChange: (next: string) => void;
  onClear: () => void;
  onCloseResults: () => void;
}


/**
 * Header search pill — pure presentation. All state lives in the parent
 * Header so route/context can react to opening/closing. This component is
 * just the input, its clear/close affordances, and the lazy results dropdown.
 */
export function HeaderSearch({
  mounted,
  isMobile,
  expanded,
  query,
  showResults,
  venues,
  deals,
  isLoading = false,
  isSearching = false,
  error = null,
  onRetry,
  onVenueSelect,
  onQueryChange,
  onClear,
  onCloseResults,
  onCollapse,
}: HeaderSearchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Return focus to the search input after any panel close or selection. */
  const focusInput = useCallback(() => {
    // Defer slightly so any parent state updates (mobile collapse, etc.)
    // settle before we attempt focus; if the input is unmounted the call
    // simply no-ops.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleCloseResults = useCallback(() => {
    onCloseResults();
    focusInput();
  }, [onCloseResults, focusInput]);

  const handleVenueSelect = useCallback(
    (venue: Parameters<typeof onVenueSelect>[0]) => {
      onVenueSelect(venue);
      focusInput();
    },
    [onVenueSelect, focusInput],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (typeof value !== "string" || value.length > MAX_QUERY_LENGTH) return;
    onQueryChange(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (query) {
      onClear();
    } else if (isMobile && expanded) {
      onCollapse();
    } else {
      e.currentTarget.blur();
    }
  };

  const hasQuery = query.length > 0;
  const canCollapse = isMobile && expanded;
  // A single trailing dismiss control — it clears the query first, then closes
  // the expanded search, matching the Escape key behaviour above.
  const showDismiss = hasQuery || canCollapse;
  const dismissLabel = hasQuery ? "Clear search" : "Close search";
  const handleDismiss = hasQuery ? onClear : onCollapse;

  // Reserve room for the trailing control so the caret never sits under it.
  const paddingRight = showDismiss
    ? "calc(var(--header-control-height, 36px) + 8px)"
    : "16px";

  return (
    <div
      ref={wrapperRef}
      data-jet-search-wrapper
      style={{
        position: "relative",
        // Grow into free space but always yield before the sync indicator
        // and avatar get squeezed out of the row.
        flex: "1 1 0%",
        minWidth: 0,
        maxWidth: isMobile ? "100%" : "clamp(200px, 36vw, 460px)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(-6px)",
        transition: "opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <Search
          style={{
            width: "var(--header-icon-size, 16px)",
            height: "var(--header-icon-size, 16px)",
            color: "hsl(var(--muted-foreground) / 0.6)",
          }}
        />
      </div>


      <Input
        ref={inputRef}
        type="text"
        placeholder={
          isMobile ? "Search venues, deals…" : "Search venues, deals, neighborhoods…"
        }
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          e.currentTarget.style.background = "hsl(var(--muted) / 0.55)";
          e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.5)";
          e.currentTarget.style.boxShadow =
            // Keep the focus ring tight so it never bleeds past the header's
            // hairline divider on short mobile headers.
            "0 0 0 2px hsl(var(--primary) / 0.12)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = "hsl(var(--muted) / 0.35)";
          e.currentTarget.style.borderColor = "hsl(var(--border) / 0.5)";
          e.currentTarget.style.boxShadow = "none";
        }}
        maxLength={MAX_QUERY_LENGTH}
        aria-label="Search venues and deals"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="jet-search-results"
        aria-haspopup="dialog"
        aria-autocomplete="list"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="search"
        autoFocus={isMobile && expanded}
        style={{
          width: "100%",
          // One shared control height across the whole nav header.
          height: "var(--header-control-height, 36px)",
          maxHeight: "var(--header-control-height, 36px)",
          minHeight: 0,
          boxSizing: "border-box",
          // Extra left padding keeps the placeholder text clear of the
          // magnifying-glass icon on narrow mobile viewports.
          paddingLeft: "calc(20px + var(--header-icon-size, 16px))",
          paddingRight,
          borderRadius: "9999px",
          border: "1.5px solid hsl(var(--border) / 0.5)",
          background: "hsl(var(--muted) / 0.35)",
          fontSize: "var(--header-font-size, 13px)",
          color: "hsl(var(--foreground))",
          outline: "none",
          // Prevent long placeholders from visually running under the icon.
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
          transition: "background 0.2s, border-color 0.3s, box-shadow 0.3s",
        }}
      />

      {showDismiss && (
        <IconButton
          size="bare"
          ariaLabel={dismissLabel}
          onClick={handleDismiss}
          className="rounded-full hover:bg-muted/80 transition-colors"
          style={{
            position: "absolute",
            right: "6px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            width: "calc(var(--header-control-height, 36px) - 10px)",
            height: "calc(var(--header-control-height, 36px) - 10px)",
            background: "hsl(var(--muted) / 0.6)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X
            style={{
              width: "calc(var(--header-icon-size, 16px) - 3px)",
              height: "calc(var(--header-icon-size, 16px) - 3px)",
              color: "hsl(var(--muted-foreground))",
            }}
          />

        </IconButton>
      )}

      {showResults && (
        <Suspense fallback={null}>
          <SearchResults
            query={query}
            venues={venues}
            deals={deals}
            onVenueSelect={handleVenueSelect}
            onClose={handleCloseResults}
            isVisible={showResults}
            isLoading={isLoading}
            isSearching={isSearching}
            error={error}
            onRetry={onRetry}

          />
        </Suspense>
      )}
    </div>
  );
}
