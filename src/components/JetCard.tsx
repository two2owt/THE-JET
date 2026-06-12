import { memo, useState, useEffect, useCallback } from "react";
import { MapPin, Users, Star, TrendingUp, X, Share2, Send, Car, Navigation, Phone, Globe, RefreshCw, Loader2 } from "lucide-react";
import { glideHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Venue } from "./MapboxHeatmap";
import { UpgradePrompt, useFeatureAccess } from "./UpgradePrompt";
import { shareVenue } from "@/utils/shareUtils";


interface NearbyParking {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  isOpen: boolean | null;
  placeId: string;
  distance?: number | null;
}

interface JetCardProps {
  venue: Venue;
  onGetDirections: () => void;
  onClose?: () => void;
  onSendToFriend?: () => void;
}

export const JetCard = memo(({ venue, onGetDirections, onClose, onSendToFriend }: JetCardProps) => {
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const { canAccessSocialFeatures } = useFeatureAccess();
  const [nearbyParking, setNearbyParking] = useState<NearbyParking[]>([]);
  const [parkingLoading, setParkingLoading] = useState(false);

  const loadParking = useCallback(async (showToast = false) => {
    if (!venue.lat || !venue.lng) return;
    setParkingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-nearby-parking', {
        body: JSON.stringify({ lat: venue.lat, lng: venue.lng, radius: 1000 }),
      });
      if (error) throw error;
      const results = data?.results ?? [];
      setNearbyParking(results);
      if (showToast) {
        if (results.length > 0) {
          toast.success(`Found ${results.length} nearby parking spot${results.length === 1 ? '' : 's'}`);
        } else {
          toast.message('No parking found nearby');
        }
      }
    } catch {
      if (showToast) toast.error("Couldn't refresh parking");
    } finally {
      setParkingLoading(false);
    }
  }, [venue.lat, venue.lng]);

  // Fetch nearby parking when venue changes
  useEffect(() => {
    setNearbyParking([]);
    loadParking(false);
  }, [venue.id, loadParking]);

  const handleRefreshParking = async () => {
    if (parkingLoading) return;
    await glideHaptic();
    await loadParking(true);
  };

  const getActivityLevel = (activity: number) => {
    if (activity >= 80) return { label: "🔥 Very Busy", color: 'hsl(var(--hot))' };
    if (activity >= 60) return { label: "🌟 Busy", color: 'hsl(var(--warm))' };
    if (activity >= 40) return { label: "✨ Moderate", color: 'hsl(var(--cool))' };
    return { label: "😌 Quiet", color: 'hsl(var(--cold))' };
  };

  const handleGetDirections = async () => {
    await glideHaptic();
    onGetDirections();
  };

  const handleShare = async () => {
    if (!canAccessSocialFeatures()) {
      setShowUpgradePrompt(true);
      return;
    }
    await glideHaptic();
    const result = await shareVenue({ id: venue.id, name: venue.name });
    if (result.success) {
      if (result.method === "native") {
        toast.success("Shared successfully!", { description: `${venue.name} shared with others` });
      } else {
        toast.success("Copied to clipboard!", { description: "Share link copied - paste it anywhere" });
      }
    } else if (result.method !== "native") {
      toast.error("Couldn't share", { description: "Please try again" });
    }
  };

  const openParkingDirections = (parking: NearbyParking) => {
    // Guard against malformed coordinates so we never open a broken Maps URL.
    if (
      typeof parking.lat !== 'number' ||
      typeof parking.lng !== 'number' ||
      Number.isNaN(parking.lat) ||
      Number.isNaN(parking.lng)
    ) {
      toast.error("Couldn't open directions", { description: "Missing parking coordinates" });
      return;
    }

    const params = new URLSearchParams({
      api: '1',
      destination: `${parking.lat},${parking.lng}`,
      travelmode: 'driving',
      dir_action: 'navigate',
    });

    // Prefer a stable Place ID destination when available (more accurate pin).
    if (parking.placeId) {
      params.set('destination_place_id', parking.placeId);
    }

    // Anchor the route at the selected venue so the user sees venue → parking.
    if (
      typeof venue.lat === 'number' &&
      typeof venue.lng === 'number' &&
      !Number.isNaN(venue.lat) &&
      !Number.isNaN(venue.lng)
    ) {
      params.set('origin', `${venue.lat},${venue.lng}`);
    }

    const url = `https://www.google.com/maps/dir/?${params.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const activityLevel = getActivityLevel(venue.activity);

  return (
    <article
      style={{
        position: 'relative',
        width: '100%',
        // Dark luxe surface — vertical gradient + hairline border with
        // a barely-there gold ambient ring (JET red/purple stays in shadow).
        background:
          'linear-gradient(180deg, hsl(var(--card) / 0.96), hsl(var(--card) / 0.82))',
        border: '1px solid hsl(0 0% 100% / 0.06)',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow:
          '0 0 60px hsl(var(--gold) / 0.05), 0 24px 50px -20px rgba(0,0,0,0.75), 0 0 0 1px hsl(var(--gold) / 0.18), inset 0 1px 0 hsl(0 0% 100% / 0.05)',
        maxHeight: '420px',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        color: 'hsl(var(--foreground))',
      }}
      aria-label={`${venue.name} - ${venue.category} in ${venue.neighborhood}`}
    >
      {/* Image Header */}
      <div style={{
        position: 'relative',
        height: '80px',
        background: 'linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--accent) / 0.2))',
        overflow: 'hidden',
      }}>
        {venue.imageUrl ? (
          <img
            src={venue.imageUrl}
            alt={venue.name}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            loading="lazy"
            onError={(e) => {
              // Swap to the centered JET-mark placeholder rather than the
              // generic stretched placeholder.svg so the card stays on-brand.
              const img = e.currentTarget;
              img.src = '/jet-email-logo.png';
              img.alt = 'JET';
              img.style.objectFit = 'contain';
              img.style.padding = 'clamp(12px, 4%, 22px)';
              img.style.filter = 'none';
              img.style.opacity = '0.85';
            }}
          />
        ) : (
          // No venue image — render the JET mark, centered with adaptive
          // breathing room so it scales gracefully across viewport widths.
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'clamp(10px, 4%, 20px)',
              background:
                'radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.18), transparent 70%)',
            }}
          >
            <img
              src="/jet-email-logo.png"
              alt=""
              loading="lazy"
              style={{
                maxWidth: '46%',
                maxHeight: '78%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                opacity: 0.9,
                filter: 'drop-shadow(0 2px 8px hsl(var(--primary) / 0.35))',
              }}
            />
          </div>
        )}
        {/* JET watermark — only render over real venue photos so the
            placeholder (which is the same mark, centered) isn't duplicated. */}
        {venue.imageUrl && (
          <img
            src="/jet-email-logo.png"
            alt="JET"
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              width: '28px',
              height: '28px',
              opacity: 0.5,
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
        )}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)',
        }} />

        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 20,
              background: 'hsl(var(--background) / 0.8)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: 'none',
              borderRadius: '50%',
              padding: '0',
              width: '44px',
              height: '44px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X style={{ width: '18px', height: '18px', color: 'hsl(var(--foreground))' }} />
          </button>
        )}

        {/* Activity Badge */}
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          // Luxe metric pill — near-black glass with hairline gold ring + ambient glow
          background:
            'linear-gradient(135deg, rgba(0,0,0,0.72), rgba(0,0,0,0.55))',
          border: '1px solid hsl(var(--gold) / 0.45)',
          boxShadow:
            '0 0 14px hsl(var(--gold) / 0.25), inset 0 1px 0 hsl(0 0% 100% / 0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '3px 10px',
          borderRadius: '9999px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <div
            className="animate-pulse"
            style={{
              width: '6px',
              height: '6px',
              background: 'hsl(var(--gold))',
              borderRadius: '50%',
              boxShadow: '0 0 8px hsl(var(--gold) / 0.7)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              background: 'var(--gradient-gold)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            {venue.activity}% ACTIVE
          </span>
        </div>

        {/* Category Badge */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid hsl(var(--silver) / 0.35)',
          boxShadow: '0 0 10px hsl(var(--silver) / 0.12)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '3px 10px',
          borderRadius: '9999px',
        }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'hsl(var(--silver))',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {venue.category}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Title */}
        <div>
          <h3 style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'hsl(var(--foreground))',
            lineHeight: 1.25,
            margin: 0,
          }}>{venue.name}</h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '4px',
            color: 'hsl(var(--muted-foreground))',
            fontSize: '11px',
          }}>
            <MapPin style={{ width: '12px', height: '12px', flexShrink: 0 }} />
            <span>{venue.neighborhood}</span>
            {venue.address && (
              <span style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                · {venue.address}
              </span>
            )}
          </div>
          {(venue.phone || venue.website) && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '10px',
              marginTop: '6px',
              fontSize: '11px',
            }}>
              {venue.phone && (
                <a
                  href={`tel:${venue.phone.replace(/[^+\d]/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'hsl(var(--gold))',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                  aria-label={`Call ${venue.name}`}
                >
                  <Phone style={{ width: '12px', height: '12px' }} />
                  {venue.phone}
                </a>
              )}
              {venue.website && (
                <a
                  href={venue.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'hsl(var(--primary))',
                    textDecoration: 'none',
                    fontWeight: 600,
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  aria-label={`Visit ${venue.name} website`}
                >
                  <Globe style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                  Website
                </a>
              )}
            </div>
          )}
        </div>

        {/* Hairline gold divider above key metrics */}
        <div
          aria-hidden="true"
          style={{
            height: '1px',
            width: '100%',
            background:
              'linear-gradient(90deg, transparent, hsl(var(--gold) / 0.35) 50%, transparent)',
          }}
        />

        {/* Inline Stats — luxe metric strip with gold/silver overlays */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '8px 10px',
            borderRadius: '10px',
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.18))',
            border: '1px solid hsl(0 0% 100% / 0.05)',
            boxShadow:
              'inset 0 1px 0 hsl(0 0% 100% / 0.04), 0 0 24px hsl(var(--gold) / 0.04)',
            fontSize: '12px',
          }}
        >
          {/* Activity — primary metric (kept on JET red/purple via activityLevel.color) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <TrendingUp style={{ width: '14px', height: '14px', color: activityLevel.color, filter: `drop-shadow(0 0 4px ${activityLevel.color})` }} />
            <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))', letterSpacing: '0.02em' }}>
              {activityLevel.label.split(" ")[1]}
            </span>
          </div>

          {/* Hairline silver vertical separator */}
          <div aria-hidden="true" style={{ width: '1px', height: '14px', background: 'hsl(var(--silver) / 0.18)' }} />

          {/* Rating — GOLD luxe overlay (precious metal accent) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Star
              style={{
                width: '14px',
                height: '14px',
                color: 'hsl(var(--gold))',
                fill: 'hsl(var(--gold))',
                filter: 'drop-shadow(0 0 4px hsl(var(--gold) / 0.55))',
              }}
            />
            <span
              style={{
                fontWeight: 700,
                background: 'var(--gradient-gold)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            >
              4.5
            </span>
          </div>

          {/* Hairline silver vertical separator */}
          <div aria-hidden="true" style={{ width: '1px', height: '14px', background: 'hsl(var(--silver) / 0.18)' }} />

          {/* Live users — SILVER platinum overlay */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Users
              style={{
                width: '14px',
                height: '14px',
                color: 'hsl(var(--silver))',
                filter: 'drop-shadow(0 0 4px hsl(var(--silver) / 0.4))',
              }}
            />
            <span style={{ fontWeight: 700, color: 'hsl(var(--silver))', letterSpacing: '0.02em' }}>
              {Math.round(venue.activity / 10) * 10}+
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }} role="group" aria-label="Venue actions">
          <button
            onClick={handleShare}
            style={{
              width: '100%',
              background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
              color: 'hsl(var(--primary-foreground))',
              fontWeight: 600,
              height: '44px',
              fontSize: '12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
            aria-label={`Share ${venue.name}`}
          >
            <Share2 style={{ width: '14px', height: '14px' }} aria-hidden="true" />
            Share
          </button>
          <button
            onClick={() => {
              glideHaptic();
              if (onSendToFriend) onSendToFriend();
            }}
            style={{
              width: '100%',
              background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
              color: 'hsl(var(--primary-foreground))',
              fontWeight: 600,
              height: '44px',
              fontSize: '12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
            aria-label={`Send ${venue.name} to a friend`}
          >
            <Send style={{ width: '14px', height: '14px' }} aria-hidden="true" />
            Send
          </button>
          <button
            onClick={handleGetDirections}
            style={{
              width: '100%',
              background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
              color: 'hsl(var(--primary-foreground))',
              fontWeight: 600,
              height: '44px',
              fontSize: '12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
            aria-label={`Get directions to ${venue.name}`}
          >
            <Navigation style={{ width: '14px', height: '14px' }} aria-hidden="true" />
            Directions
          </button>
        </div>

        {/* Nearby Parking Section */}
        {venue.lat && venue.lng && (
          <div style={{
            borderTop: '1px solid hsl(var(--border) / 0.5)',
            paddingTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'hsl(var(--muted-foreground))',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <Car style={{ width: '12px', height: '12px' }} />
              <span>Nearby Parking</span>
              <button
                type="button"
                onClick={handleRefreshParking}
                disabled={parkingLoading}
                aria-label="Refresh nearby parking"
                style={{
                  marginLeft: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'hsl(var(--secondary) / 0.5)',
                  border: '1px solid hsl(var(--border) / 0.4)',
                  color: 'hsl(var(--foreground))',
                  padding: '3px 8px',
                  borderRadius: '9999px',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  cursor: parkingLoading ? 'not-allowed' : 'pointer',
                  opacity: parkingLoading ? 0.5 : 1,
                }}
              >
                {parkingLoading ? (
                  <Loader2 className="animate-spin" style={{ width: '11px', height: '11px' }} />
                ) : (
                  <RefreshCw style={{ width: '11px', height: '11px' }} />
                )}
                {parkingLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {parkingLoading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 0',
                fontSize: '11px',
                color: 'hsl(var(--muted-foreground))',
              }}>
                <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} />
                <span>Finding nearest parking...</span>
              </div>
            )}
            {!parkingLoading && nearbyParking.length === 0 && (
              <div style={{
                fontSize: '11px',
                color: 'hsl(var(--muted-foreground))',
                padding: '4px 2px',
              }}>
                No parking found nearby. Tap Refresh to try again.
              </div>
            )}

            {nearbyParking.map((parking, i) => (
              <button
                key={parking.placeId || i}
                onClick={() => openParkingDirections(parking)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  background: 'hsl(var(--secondary) / 0.4)',
                  border: '1px solid hsl(var(--border) / 0.3)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'hsl(var(--primary) / 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Car style={{ width: '14px', height: '14px', color: 'hsl(var(--primary))' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{parking.name}</div>
                  <div style={{
                    fontSize: '10px',
                    color: 'hsl(var(--muted-foreground))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {typeof parking.distance === 'number' && (
                      <span style={{ color: 'hsl(var(--gold))', fontWeight: 600, marginRight: '4px' }}>
                        {parking.distance < 1000
                          ? `${parking.distance}m`
                          : `${(parking.distance / 1000).toFixed(1)}km`}
                        ·
                      </span>
                    )}
                    {parking.address}
                    {parking.isOpen !== null && (
                      <span style={{ color: parking.isOpen ? 'hsl(var(--cool))' : 'hsl(var(--hot))', marginLeft: '4px' }}>
                        · {parking.isOpen ? 'Open' : 'Closed'}
                      </span>
                    )}
                  </div>
                </div>
                <Navigation style={{ width: '14px', height: '14px', color: 'hsl(var(--primary))', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <UpgradePrompt
        requiredTier="jet_plus"
        featureName="Venue sharing"
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
      />

    </article>
  );
});
