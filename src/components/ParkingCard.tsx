import { memo, useState, useEffect } from "react";
import {
  Car,
  MapPin,
  Star,
  X,
  Phone,
  Globe,
  Navigation,
  Loader2,
} from "lucide-react";
import { glideHaptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { buildDirectionsUrl } from "@/lib/directions-url";
import { openExternalUrl } from "@/lib/open-external";

export interface ParkingLot {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  totalRatings: number;
  isOpen: boolean | null;
  openingHours: string[];
  priceLevel: number | null;
  priceLabel?: string | null;
  priceDetail?: string | null;
  phone?: string | null;
  website?: string | null;
  placeId?: string;
}

interface ParkingCardProps {
  lat: number;
  lng: number;
  name?: string;
  onClose?: () => void;
  onGetDirections?: () => void;
}

export const ParkingCard = memo(
  ({ lat, lng, name, onClose, onGetDirections }: ParkingCardProps) => {
    const [parking, setParking] = useState<ParkingLot | null>(null);
    const [loading, setLoading] = useState(true);
    const [, setError] = useState<string | null>(null);

    useEffect(() => {
      const fetchDetails = async () => {
        setLoading(true);
        setError(null);
        try {
          const { data, error: fnError } = await supabase.functions.invoke(
            "get-parking-details",
            {
              body: JSON.stringify({ lat, lng, name }),
            },
          );

          if (fnError) throw fnError;
          setParking(data);
        } catch (e) {
          console.error("Failed to fetch parking details:", e);
          setError("Could not load parking details");
          // Show minimal fallback
          setParking({
            name: name || "Parking",
            address: "Address unavailable",
            lat,
            lng,
            rating: null,
            totalRatings: 0,
            isOpen: null,
            openingHours: [],
            priceLevel: null,
          });
        } finally {
          setLoading(false);
        }
      };

      fetchDetails();
    }, [lat, lng, name]);

    const handleGetDirections = async () => {
      await glideHaptic();
      if (onGetDirections) {
        onGetDirections();
        return;
      }
      // Platform-aware turn-by-turn navigation across Google / Apple / Waze
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const url = buildDirectionsUrl(
        isIOS ? "apple" : "google",
        {
          lat,
          lng,
          name: parking?.name || name || "Parking",
          address: parking?.address ?? "",
        },
        { placeId: parking?.placeId },
      );
      if (!url) return;
      openExternalUrl(url);
    };

    const getPriceLevelLabel = (level: number | null) => {
      if (level === null || level === undefined) return null;
      if (level === 0) return "Free";
      return "$".repeat(level);
    };

    const priceLabel =
      parking?.priceLabel ?? getPriceLevelLabel(parking?.priceLevel ?? null);
    const priceDetail =
      parking?.priceDetail ??
      (priceLabel === "Free"
        ? "No charge"
        : priceLabel
          ? "Estimated hourly rate"
          : null);

    return (
      <article
        style={{
          position: "relative",
          width: "100%",
          background: "hsl(var(--card))",
          border: "2px solid hsl(var(--primary) / 0.4)",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.15), 0 0 24px hsl(var(--primary) / 0.1)",
          maxHeight: "300px",
          fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
          color: "hsl(var(--foreground))",
        }}
        aria-label={`Parking: ${parking?.name || name || "Loading..."}`}
      >
        {/* Header with icon */}
        <div
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid hsl(var(--border) / 0.3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "hsl(var(--primary) / 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Car
                style={{
                  width: "20px",
                  height: "20px",
                  color: "hsl(var(--primary))",
                }}
              />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {loading ? (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Loader2
                    className="animate-spin"
                    style={{
                      width: "14px",
                      height: "14px",
                      color: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    Loading...
                  </span>
                </div>
              ) : (
                <>
                  <h3
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "hsl(var(--foreground))",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {parking?.name}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginTop: "2px",
                    }}
                  >
                    {parking?.isOpen !== null && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: parking?.isOpen
                            ? "hsl(142, 76%, 36%)"
                            : "hsl(0, 84%, 60%)",
                        }}
                      >
                        {parking?.isOpen ? "● Open" : "● Closed"}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color:
                          priceLabel === "Free"
                            ? "hsl(142, 76%, 40%)"
                            : priceLabel
                              ? "hsl(var(--gold))"
                              : "hsl(var(--muted-foreground))",
                        background:
                          priceLabel === "Free"
                            ? "hsl(142, 76%, 40% / 0.12)"
                            : priceLabel
                              ? "hsl(var(--gold) / 0.15)"
                              : "hsl(var(--muted) / 0.25)",
                        padding: "1px 6px",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {priceLabel ?? "Rate varies"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "hsl(var(--muted) / 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
              }}
              aria-label="Close"
            >
              <X
                style={{
                  width: "14px",
                  height: "14px",
                  color: "hsl(var(--muted-foreground))",
                }}
              />
            </button>
          )}
        </div>

        {/* Details */}
        {!loading && parking && (
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {/* Address */}
            {parking.address && parking.address !== "Address unavailable" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                }}
              >
                <MapPin
                  style={{
                    width: "14px",
                    height: "14px",
                    color: "hsl(var(--muted-foreground))",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    color: "hsl(var(--muted-foreground))",
                    lineHeight: 1.4,
                  }}
                >
                  {parking.address}
                </span>
              </div>
            )}

            {/* Price */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Car
                style={{
                  width: "14px",
                  height: "14px",
                  color: "hsl(var(--gold))",
                  flexShrink: 0,
                }}
              />
              <span
                style={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
              >
                {priceLabel ? `${priceLabel} parking` : "Parking rate varies"}
                {priceDetail && (
                  <span
                    style={{
                      color: "hsl(var(--muted-foreground))",
                      marginLeft: "4px",
                    }}
                  >
                    · {priceDetail}
                  </span>
                )}
              </span>
            </div>

            {/* Rating */}
            {parking.rating && (
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Star
                  style={{
                    width: "14px",
                    height: "14px",
                    color: "hsl(45, 100%, 50%)",
                    fill: "hsl(45, 100%, 50%)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
                >
                  {parking.rating.toFixed(1)}
                  <span
                    style={{
                      color: "hsl(var(--muted-foreground))",
                      marginLeft: "4px",
                    }}
                  >
                    ({parking.totalRatings.toLocaleString()} reviews)
                  </span>
                </span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
              <button
                onClick={handleGetDirections}
                style={{
                  flex: 1,
                  background:
                    "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))",
                  color: "hsl(var(--primary-foreground))",
                  fontWeight: 600,
                  height: "36px",
                  fontSize: "12px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                }}
              >
                <Navigation style={{ width: "14px", height: "14px" }} />
                Directions
              </button>
              {parking.phone && (
                <button
                  onClick={() => window.open(`tel:${parking.phone}`, "_self")}
                  style={{
                    background:
                      "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))",
                    color: "hsl(var(--primary-foreground))",
                    fontWeight: 600,
                    height: "36px",
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    padding: "0 12px",
                  }}
                >
                  <Phone style={{ width: "14px", height: "14px" }} />
                  Call
                </button>
              )}
              {parking.website && (
                <button
                  onClick={() => openExternalUrl(parking.website!)}
                  style={{
                    background:
                      "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))",
                    color: "hsl(var(--primary-foreground))",
                    fontWeight: 600,
                    height: "36px",
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    padding: "0 12px",
                  }}
                >
                  <Globe style={{ width: "14px", height: "14px" }} />
                  Web
                </button>
              )}
            </div>
          </div>
        )}
      </article>
    );
  },
);

ParkingCard.displayName = "ParkingCard";
