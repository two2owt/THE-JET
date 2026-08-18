import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export const OfflineBanner = () => {
  const isOnline = useOnlineStatus();

  // Don't render anything when online - no CLS since no space is reserved
  if (isOnline) return null;

  // Position as absolute overlay within header area - doesn't shift content
  // Uses transform for animation instead of top to avoid CLS
  return (
    <div
      className="fixed left-0 right-0 z-[100] flex items-center justify-center gap-3 backdrop-blur-md px-4 py-2 text-sm font-medium"
      style={{
        top: "var(--header-total-height, 52px)",
        // Dark luxe surface — near-black with a gold hairline accent
        background:
          "linear-gradient(180deg, hsl(var(--background) / 0.94), hsl(var(--background) / 0.82))",
        color: "hsl(var(--foreground))",
        borderTop: "1px solid hsl(var(--gold) / 0.35)",
        borderBottom: "1px solid hsl(var(--gold) / 0.25)",
        boxShadow:
          "0 6px 20px -8px hsl(0 0% 0% / 0.6), 0 0 40px hsl(var(--gold) / 0.06)",
        letterSpacing: "0.012em",
        animation: "slideInFromTop 0.3s ease-out",
        contain: "layout style",
      }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <WifiOff
          className="h-4 w-4 flex-shrink-0"
          style={{ color: "hsl(var(--gold))" }}
          aria-hidden="true"
        />
        <span>You're offline</span>
      </div>

    </div>
  );
};
