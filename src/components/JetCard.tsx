import { memo, useState, useEffect } from "react";
import { MapPin, Users, Star, TrendingUp, X, Share2, Send, Car, Navigation, Loader2 } from "lucide-react";
import { glideHaptic } from "@/lib/haptics";
import { glideHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Venue } from "./MapboxHeatmap";
import { UpgradePrompt, useFeatureAccess } from "./UpgradePrompt";
import { shareVenue } from "@/utils/shareUtils";
import { ShareToFriendDialog } from "./ShareToFriendDialog";

interface NearbyParking {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  isOpen: boolean | null;
  placeId: string;
}

interface JetCardProps {
  venue: Venue;
  onGetDirections: () => void;
  onClose?: () => void;
}

export const JetCard = memo(({ venue, onGetDirections, onClose }: JetCardProps) => {
  const [user, setUser] = useState<any>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const { canAccessSocialFeatures } = useFeatureAccess();
  const [nearbyParking, setNearbyParking] = useState<NearbyParking[]>([]);
  const [parkingLoading, setParkingLoading] = useState(false);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch nearby parking when venue changes
  useEffect(() => {
    if (!venue.lat || !venue.lng) return;
    let cancelled = false;
    setParkingLoading(true);
    setNearbyParking([]);

    supabase.functions.invoke('get-nearby-parking', {
      body: JSON.stringify({ lat: venue.lat, lng: venue.lng, radius: 1000 }),
    }).then(({ data, error }) => {
      if (cancelled) return;
      setParkingLoading(false);
      if (!error && data?.results) {
        setNearbyParking(data.results);
      }
    }).catch(() => {
      if (!cancelled) setParkingLoading(false);
    });

    return () => { cancelled = true; };
  }, [venue.id, venue.lat, venue.lng]);

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
    const url = `https://www.google.com/maps/dir/?api=1&destination=${parking.lat},${parking.lng}&destination_place_id=${parking.placeId}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const activityLevel = getActivityLevel(venue.activity);

  return (
    <article
      style={{
        position: 'relative',
        width: '100%',
        background: 'hsl(var(--card))',
        border: '2px solid hsl(var(--primary) / 0.4)',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 0 24px hsl(var(--primary) / 0.1)',
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
        {venue.imageUrl && (
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
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
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
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X style={{ width: '16px', height: '16px', color: 'hsl(var(--foreground))' }} />
          </button>
        )}

        {/* Activity Badge */}
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '2px 8px',
          borderRadius: '9999px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <div style={{ width: '6px', height: '6px', background: 'hsl(var(--primary))', borderRadius: '50%' }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>{venue.activity}% Active</span>
        </div>

        {/* Category Badge */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '2px 8px',
          borderRadius: '9999px',
        }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'white' }}>{venue.category}</span>
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
        </div>

        {/* Inline Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp style={{ width: '14px', height: '14px', color: activityLevel.color }} />
            <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{activityLevel.label.split(" ")[1]}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Star style={{ width: '14px', height: '14px', color: 'hsl(var(--warm))' }} />
            <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>4.5</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Users style={{ width: '14px', height: '14px', color: 'hsl(var(--muted-foreground))' }} />
            <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{Math.round(venue.activity / 10) * 10}+</span>
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
              height: '36px',
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
              if (!canAccessSocialFeatures()) {
                setShowUpgradePrompt(true);
                return;
              }
              if (!user) {
                toast.error("Sign in to send venues to friends");
                return;
              }
              glideHaptic();
              setShowSendDialog(true);
            }}
            style={{
              width: '100%',
              background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
              color: 'hsl(var(--primary-foreground))',
              fontWeight: 600,
              height: '36px',
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
              height: '36px',
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
        {(parkingLoading || nearbyParking.length > 0) && (
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
              {parkingLoading && <Loader2 style={{ width: '10px', height: '10px', animation: 'spin 1s linear infinite' }} />}
            </div>

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

      {user && (
        <ShareToFriendDialog
          isOpen={showSendDialog}
          onClose={() => setShowSendDialog(false)}
          userId={user.id}
          venue={{
            id: venue.id,
            name: venue.name,
            neighborhood: venue.neighborhood,
            category: venue.category,
            activity: venue.activity,
          }}
        />
      )}
    </article>
  );
});
