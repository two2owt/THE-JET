ALTER TABLE public.user_favorites REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_favorites;