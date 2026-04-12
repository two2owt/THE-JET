import { memo, useState, useEffect } from "react";
import { Car, MapPin, Star, Clock, X, Phone, Globe, Navigation, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { glideHaptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";

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

export const ParkingCard = memo(({ lat, lng, name, onClose, onGetDirections }: ParkingCardProps) => {
  const [parking, setParking] = useState<ParkingLot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-parking-details', {
          body: JSON.stringify({ lat, lng, name }),
        });

        if (fnError) throw fnError;
        setParking(data);
      } catch (e) {
        console.error('Failed to fetch parking details:', e);
        setError('Could not load parking details');
        // Show minimal fallback
        setParking({
          name: name || 'Parking',
          address: 'Address unavailable',
          lat, lng,
          rating: null, totalRatings: 0,
          isOpen: null, openingHours: [],
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
    // Platform-aware turn-by-turn navigation
    const destination = encodeURIComponent(parking?.name || `${lat},${lng}`);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      // Apple Maps with driving directions
      window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`, '_blank');
    } else {
      // Google Maps with driving mode for turn-by-turn
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${parking?.placeId || ''}&travelmode=driving`, '_blank');
    }
  };

  const getPriceLevelLabel = (level: number | null) => {
    if (level === null || level === undefined) return null;
    if (level === 0) return 'Free';
    return '$'.repeat(level);
  };

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
        maxHeight: '300px',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        color: 'hsl(var(--foreground))',
      }}
      aria-label={`Parking: ${parking?.name || name || 'Loading...'}`}
    >
      {/* Header with icon */}
      <div style={{
        background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid hsl(var(--border) / 0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'hsl(var(--primary) / 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Car style={{ width: '20px', height: '20px', color: 'hsl(var(--primary))' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 className="animate-spin" style={{ width: '14px', height: '14px', color: 'hsl(var(--muted-foreground))' }} />
                <span style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>Loading...</span>
              </div>
            ) : (
              <>
                <h3 style={{ 
                  fontSize: '15px', fontWeight: 700, 
                  color: 'hsl(var(--foreground))',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {parking?.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  {parking?.isOpen !== null && (
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: parking.isOpen ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)',
                    }}>
                      {parking.isOpen ? '● Open' : '● Closed'}
                    </span>
                  )}
                  {getPriceLevelLabel(parking?.priceLevel ?? null) && (
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: 'hsl(var(--primary))',
                      background: 'hsl(var(--primary) / 0.1)',
                      padding: '1px 6px', borderRadius: '4px',
                    }}>
                      {getPriceLevelLabel(parking?.priceLevel ?? null)}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'hsl(var(--muted) / 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
            aria-label="Close"
          >
            <X style={{ width: '14px', height: '14px', color: 'hsl(var(--muted-foreground))' }} />
          </button>
        )}
      </div>

      {/* Details */}
      {!loading && parking && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Address */}
          {parking.address && parking.address !== 'Address unavailable' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <MapPin style={{ width: '14px', height: '14px', color: 'hsl(var(--muted-foreground))', flexShrink: 0, marginTop: '2px' }} />
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
                {parking.address}
              </span>
            </div>
          )}

          {/* Rating */}
          {parking.rating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Star style={{ width: '14px', height: '14px', color: 'hsl(45, 100%, 50%)', fill: 'hsl(45, 100%, 50%)', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'hsl(var(--foreground))' }}>
                {parking.rating.toFixed(1)}
                <span style={{ color: 'hsl(var(--muted-foreground))', marginLeft: '4px' }}>
                  ({parking.totalRatings.toLocaleString()} reviews)
                </span>
              </span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Button
              size="sm"
              onClick={handleGetDirections}
              style={{ flex: 1, fontSize: '12px', gap: '6px' }}
            >
              <Navigation style={{ width: '14px', height: '14px' }} />
              Directions
            </Button>
            {parking.phone && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(`tel:${parking.phone}`, '_self')}
                style={{ fontSize: '12px', gap: '6px' }}
              >
                <Phone style={{ width: '14px', height: '14px' }} />
                Call
              </Button>
            )}
            {parking.website && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(parking.website!, '_blank')}
                style={{ fontSize: '12px', gap: '6px' }}
              >
                <Globe style={{ width: '14px', height: '14px' }} />
                Web
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
});

ParkingCard.displayName = 'ParkingCard';
