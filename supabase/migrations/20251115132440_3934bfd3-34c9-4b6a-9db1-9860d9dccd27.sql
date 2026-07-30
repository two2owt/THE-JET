-- Create neighborhoods table with geofence boundaries
CREATE TABLE public.neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  -- Store polygon as array of lat/lng points [lat, lng]
  boundary_points JSONB NOT NULL,
  -- Approximate center point for quick distance checks
  center_lat DECIMAL(10, 8) NOT NULL,
  center_lng DECIMAL(11, 8) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create deals table
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id TEXT NOT NULL, -- Reference to venue (for now just text, later can be FK)
  venue_name TEXT NOT NULL,
  neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deal_type TEXT NOT NULL CHECK (deal_type IN ('offer', 'event', 'special')),
  -- Time constraints
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  -- Days of week active (0 = Sunday, 6 = Saturday)
  active_days INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_locations table to track user positions
CREATE TABLE public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2),
  current_neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create push_subscriptions table for Web Push
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create notification_logs table
CREATE TABLE public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  read BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for neighborhoods (public read)
CREATE POLICY "Neighborhoods are viewable by everyone"
  ON public.neighborhoods FOR SELECT
  USING (active = true);

-- RLS Policies for deals (public read for active deals)
CREATE POLICY "Active deals are viewable by everyone"
  ON public.deals FOR SELECT
  USING (active = true AND starts_at <= now() AND expires_at > now());

-- RLS Policies for user_locations (users can only see/update their own)
CREATE POLICY "Users can view their own locations"
  ON public.user_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own locations"
  ON public.user_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for push_subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for notification_logs
CREATE POLICY "Users can view their own notifications"
  ON public.notification_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notification_logs FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_deals_neighborhood ON public.deals(neighborhood_id);
CREATE INDEX idx_deals_active ON public.deals(active, starts_at, expires_at);
CREATE INDEX idx_user_locations_user ON public.user_locations(user_id);
CREATE INDEX idx_user_locations_neighborhood ON public.user_locations(current_neighborhood_id);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX idx_notification_logs_user ON public.notification_logs(user_id);

-- Insert Charlotte neighborhoods
INSERT INTO public.neighborhoods (name, slug, boundary_points, center_lat, center_lng, description) VALUES
('South End', 'south-end', 
 '[[35.2144, -80.8542], [35.2144, -80.8342], [35.2244, -80.8342], [35.2244, -80.8542]]'::jsonb,
 35.2194, -80.8442, 'Trendy neighborhood with breweries and restaurants'),
 
('Uptown', 'uptown',
 '[[35.2200, -80.8500], [35.2200, -80.8380], [35.2300, -80.8380], [35.2300, -80.8500]]'::jsonb,
 35.2250, -80.8440, 'Downtown Charlotte with rooftop bars and fine dining'),
 
('Plaza Midwood', 'plaza-midwood',
 '[[35.2000, -80.8250], [35.2000, -80.8150], [35.2100, -80.8150], [35.2100, -80.8250]]'::jsonb,
 35.2050, -80.8200, 'Eclectic arts district with dive bars and live music'),
 
('NoDa', 'noda',
 '[[35.2450, -80.8050], [35.2450, -80.7950], [35.2550, -80.7950], [35.2550, -80.8050]]'::jsonb,
 35.2500, -80.8000, 'Arts and entertainment district with galleries and breweries'),
 
('Camp North End', 'camp-north-end',
 '[[35.2350, -80.8350], [35.2350, -80.8250], [35.2450, -80.8250], [35.2450, -80.8350]]'::jsonb,
 35.2400, -80.8300, 'Creative campus with food halls and markets');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_neighborhoods_updated_at ON public.neighborhoods;
CREATE TRIGGER update_neighborhoods_updated_at
BEFORE UPDATE ON public.neighborhoods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deals_updated_at ON public.deals;
CREATE TRIGGER update_deals_updated_at
BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();