import { lazy, Suspense, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import type { Venue } from "@/types/venue";

const SearchResults = lazy(() =>
  import("@/components/SearchResults").then((m) => ({ default: m.SearchResults }))
);

const MAX_QUERY_LENGTH = 100;

export interface HeaderSearchProps {
  /** Header mount transition flag (drives fade-in). */
  mounted: boolean;
  /** True when the viewport is mobile-sized. */
  isMobile: boolean;
  /** Mobile: whether the input is expanded (full-width) vs. icon-only. */
  expanded: boolean;
  /** Current query string (controlled by parent). */
  query: string;
  /** Whether the results dropdown is visible. */
  showResults: boolean;
  /** Data passed through to SearchResults. */
  venues: Venue[];
  deals: unknown[];
  onVenueSelect: (venue: Venue) => void;
  /** Setters / handlers wired from parent. */
  onQueryChange: (next: string) => void;
  onClear: () => void;
  onCloseResults: () => void;
  onCollapse: () => void;
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
  onVenueSelect,
  onQueryChange,
  onClear,
  onCloseResults,
  onCollapse,
}: HeaderSearchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const showClear = query.length > 0;
  const showCollapse = isMobile && expanded;

  // Reserve room for the trailing controls so the caret never sits under them.
  const paddingRight = showCollapse
    ? showClear
      ? "80px"
      : "44px"
    : showClear
      ? "44px"
      : "16px";

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        flex: "1 1 0%",
        maxWidth: isMobile ? "none" : "clamp(240px, 42vw, 520px)",
        minWidth: 0,
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
        <Search style={{ width: 16, height: 16, color: "hsl(var(--muted-foreground) / 0.6)" }} />
      </div>

      <Input
        type="text"
        placeholder="Search venues, deals, neighborhoods..."
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          e.currentTarget.style.background = "hsl(var(--muted) / 0.55)";
          e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.5)";
          e.currentTarget.style.boxShadow =
            "0 0 0 3px hsl(var(--primary) / 0.1), 0 0 12px hsl(var(--primary) / 0.08)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = "hsl(var(--muted) / 0.35)";
          e.currentTarget.style.borderColor = "hsl(var(--border) / 0.5)";
          e.currentTarget.style.boxShadow = "none";
        }}
        maxLength={MAX_QUERY_LENGTH}
        aria-label="Search venues and deals"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="search"
        autoFocus={isMobile && expanded}
        style={{
          width: "100%",
          height: "clamp(34px, 5vw, 40px)",
          paddingLeft: "36px",
          paddingRight,
          borderRadius: "9999px",
          border: "1.5px solid hsl(var(--border) / 0.5)",
          background: "hsl(var(--muted) / 0.35)",
          fontSize: "14px",
          color: "hsl(var(--foreground))",
          outline: "none",
          transition: "background 0.2s, border-color 0.3s, box-shadow 0.3s",
        }}
      />

      {showClear && (
        <IconButton
          size="bare"
          ariaLabel="Clear search"
          onClick={onClear}
          className="rounded-full hover:bg-muted/80 transition-colors"
          style={{
            position: "absolute",
            right: showCollapse ? "44px" : "8px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            width: 28,
            height: 28,
            background: "hsl(var(--muted) / 0.6)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X style={{ width: 12, height: 12, color: "hsl(var(--muted-foreground))" }} />
        </IconButton>
      )}

      {showCollapse && (
        <IconButton
          size="bare"
          ariaLabel="Close search"
          onClick={onCollapse}
          className="rounded-full hover:bg-muted/60 transition-colors"
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            width: 28,
            height: 28,
          }}
        >
          <X style={{ width: 14, height: 14, color: "hsl(var(--muted-foreground))" }} />
        </IconButton>
      )}

      {showResults && (
        <Suspense fallback={null}>
          <SearchResults
            query={query}
            venues={venues}
            deals={deals as never}
            onVenueSelect={onVenueSelect}
            onClose={onCloseResults}
            isVisible={showResults}
          />
        </Suspense>
      )}
    </div>
  );
}