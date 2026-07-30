-- Create venue_reviews table for ratings and reviews
CREATE TABLE public.venue_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  venue_id TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_venue_reviews_venue_id ON public.venue_reviews(venue_id);
CREATE INDEX idx_venue_reviews_user_id ON public.venue_reviews(user_id);

-- Enable RLS
ALTER TABLE public.venue_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for venue_reviews
CREATE POLICY "Anyone can view reviews"
  ON public.venue_reviews
  FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own reviews"
  ON public.venue_reviews
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews"
  ON public.venue_reviews
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
  ON public.venue_reviews
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_venue_reviews_updated_at ON public.venue_reviews;
CREATE TRIGGER update_venue_reviews_updated_at
BEFORE UPDATE ON public.venue_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create user_connections table for social features (friends)
CREATE TABLE public.user_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  friend_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Create indexes
CREATE INDEX idx_user_connections_user_id ON public.user_connections(user_id);
CREATE INDEX idx_user_connections_friend_id ON public.user_connections(friend_id);
CREATE INDEX idx_user_connections_status ON public.user_connections(status);

-- Enable RLS
ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_connections
CREATE POLICY "Users can view their own connections"
  ON public.user_connections
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create connection requests"
  ON public.user_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update connections they're part of"
  ON public.user_connections
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete their own connections"
  ON public.user_connections
  FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_user_connections_updated_at ON public.user_connections;
CREATE TRIGGER update_user_connections_updated_at
BEFORE UPDATE ON public.user_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();