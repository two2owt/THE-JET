-- Add tables used by realtime subscriptions to the publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_favorites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.search_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;