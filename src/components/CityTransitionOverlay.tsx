import { useEffect, useState } from "react";
import planeAsset from "@/assets/jet-paper-plane.png.asset.json";
const planeImg = planeAsset.url;
import type { City } from "@/types/cities";

interface CityTransitionOverlayProps {
  city: City | null;
  /** Unique key that increments every time the city is (re)selected, so the
   *  animation replays even if the user re-selects the same city. */
  nonce: number;
}

/**
 * Full-bleed overlay: paper plane takes off from the left, flies across the
 * screen, and "lands" with an "Arriving in <City>" caption. GPU-only animation
 * (transform + opacity) so it costs 0 CLS.
 */
export function CityTransitionOverlay({ city, nonce }: CityTransitionOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!city || nonce === 0) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 2400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (!visible || !city) return null;

  return (
    <div
      aria-live="polite"
      aria-label={`Arriving in ${city.name}, ${city.state}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80, // above map (z-10) and below header (z-60) toasts
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        animation: "city-overlay-fade 2.4s ease-out forwards",
        background:
          "radial-gradient(ellipse at center, hsl(var(--background) / 0.55) 0%, hsl(var(--background) / 0) 70%)",
      }}
    >
      {/* Caption */}
      <div
        style={{
          textAlign: "center",
          animation: "city-caption-in 2.4s ease-out forwards",
          opacity: 0,
          transform: "translateY(8px)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "hsl(var(--gold) / 0.9)",
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          Arriving in
        </div>
        <div
          className="font-display"
          style={{
            fontSize: "clamp(28px, 6vw, 48px)",
            fontWeight: 700,
            lineHeight: 1.05,
            backgroundImage:
              "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          {city.name}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "hsl(var(--muted-foreground))",
            marginTop: 4,
          }}
        >
          {city.state}
        </div>
      </div>

      {/* Paper plane flying across */}
      <img
        src={planeImg}
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          width: "clamp(72px, 12vw, 128px)",
          height: "auto",
          willChange: "transform, opacity",
          animation: "plane-flight 2.4s cubic-bezier(0.4, 0.0, 0.2, 1) forwards",
        }}
      />
    </div>
  );
}