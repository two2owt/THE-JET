import { memo } from "react";
import { MapPinOff, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { useUserLocation, requestUserLocation } from "@/hooks/useUserLocation";

/**
 * Persistent, dismissible-free banner shown when the browser denies (or
 * cannot provide) the user's location. Keeps the app functional: features
 * fall back to non-personalized results while the banner explains how to
 * restore location and offers a one-tap retry.
 */
export const LocationPermissionBanner = memo(function LocationPermissionBanner({
  className,
}: {
  className?: string;
}) {
  const { status, error } = useUserLocation();

  if (status !== "denied" && status !== "unsupported") return null;

  const isUnsupported = status === "unsupported";

  return (
    <div
      role="status"
      aria-live="polite"
      className={className}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "12px 14px",
        borderRadius: "12px",
        border: "1px solid hsl(var(--border) / 0.6)",
        background:
          "linear-gradient(180deg, hsl(var(--muted) / 0.55), hsl(var(--muted) / 0.25))",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "hsl(var(--destructive) / 0.15)",
          color: "hsl(var(--destructive))",
          flexShrink: 0,
        }}
      >
        <MapPinOff style={{ width: 18, height: 18 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))" }}>
          {isUnsupported ? "Location unavailable" : "Location access is off"}
        </div>
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            marginTop: 2,
            color: "hsl(var(--muted-foreground))",
          }}
        >
          {isUnsupported
            ? "Your browser doesn't support location. Showing everything — distances won't be personalized."
            : "Enable location in your browser or system settings for distance and nearby deals. You'll still see everything in the meantime."}
          {error && !isUnsupported ? ` (${error})` : null}
        </p>
      </div>
      {!isUnsupported && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => requestUserLocation()}
          className="shrink-0"
          aria-label="Try requesting location again"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Try again
        </Button>
      )}
    </div>
  );
});
