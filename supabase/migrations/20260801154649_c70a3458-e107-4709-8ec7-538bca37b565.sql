-- 1. Atomic connection request rate limit (advisory lock prevents concurrent bypass)
CREATE OR REPLACE FUNCTION public.check_connection_rate_limit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  request_count integer;
  rate_limit integer := 10;
  time_window interval := '1 hour';
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Serialize concurrent rate-limit checks for the same user within the
  -- transaction so parallel inserts cannot race past the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('connection_rate_limit', 0), hashtextextended(_user_id::text, 0)::int);

  SELECT COUNT(*) INTO request_count
  FROM user_connections
  WHERE user_id = _user_id
    AND created_at > NOW() - time_window;

  RETURN request_count < rate_limit;
END;
$function$;

-- 2. Scope policies to the authenticated role instead of public
-- deal_shares
DROP POLICY IF EXISTS "Admins can view all shares" ON public.deal_shares;
CREATE POLICY "Admins can view all shares" ON public.deal_shares FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can view their own shares" ON public.deal_shares;
CREATE POLICY "Users can view their own shares" ON public.deal_shares FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can add their own shares" ON public.deal_shares;
CREATE POLICY "Users can add their own shares" ON public.deal_shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- messages
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT TO authenticated USING ((auth.uid() = sender_id) OR (auth.uid() = recipient_id));
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);
DROP POLICY IF EXISTS "Recipients can mark messages as read" ON public.messages;
CREATE POLICY "Recipients can mark messages as read" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);
DROP POLICY IF EXISTS "Users can send messages to connections" ON public.messages;
CREATE POLICY "Users can send messages to connections" ON public.messages FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = sender_id) AND (EXISTS (
  SELECT 1 FROM user_connections
  WHERE user_connections.status = 'accepted'
    AND (((user_connections.user_id = auth.uid()) AND (user_connections.friend_id = messages.recipient_id))
      OR ((user_connections.friend_id = auth.uid()) AND (user_connections.user_id = messages.recipient_id)))
)));

-- notification_logs
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notification_logs;
CREATE POLICY "Admins can view all notifications" ON public.notification_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notification_logs;
CREATE POLICY "Users can view their own notifications" ON public.notification_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notification_logs;
CREATE POLICY "Users can update their own notifications" ON public.notification_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- push_subscriptions
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view their own subscriptions" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert their own subscriptions" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update their own subscriptions" ON public.push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete their own subscriptions" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- search_history
DROP POLICY IF EXISTS "Admins can view all search history" ON public.search_history;
CREATE POLICY "Admins can view all search history" ON public.search_history FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can view their own search history" ON public.search_history;
CREATE POLICY "Users can view their own search history" ON public.search_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can add to their search history" ON public.search_history;
CREATE POLICY "Users can add to their search history" ON public.search_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their search history" ON public.search_history;
CREATE POLICY "Users can delete their search history" ON public.search_history FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_favorites
DROP POLICY IF EXISTS "Admins can view all favorites" ON public.user_favorites;
CREATE POLICY "Admins can view all favorites" ON public.user_favorites FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can view their own favorites" ON public.user_favorites;
CREATE POLICY "Users can view their own favorites" ON public.user_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can add their own favorites" ON public.user_favorites;
CREATE POLICY "Users can add their own favorites" ON public.user_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own favorites" ON public.user_favorites;
CREATE POLICY "Users can delete their own favorites" ON public.user_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_locations
DROP POLICY IF EXISTS "Admins can view all locations" ON public.user_locations;
CREATE POLICY "Admins can view all locations" ON public.user_locations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can view their own locations" ON public.user_locations;
CREATE POLICY "Users can view their own locations" ON public.user_locations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own locations" ON public.user_locations;
CREATE POLICY "Users can insert their own locations" ON public.user_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own locations" ON public.user_locations;
CREATE POLICY "Users can update their own locations" ON public.user_locations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own locations" ON public.user_locations;
CREATE POLICY "Users can delete their own locations" ON public.user_locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_preferences
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_preferences;
CREATE POLICY "Users can insert their own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.user_preferences;
CREATE POLICY "Users can delete their own preferences" ON public.user_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Stop broadcasting precise coordinates over realtime; publish only non-sensitive columns
ALTER TABLE public.user_locations REPLICA IDENTITY USING INDEX user_locations_pkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.user_locations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations (id, user_id, current_neighborhood_id, accuracy, created_at);
  END IF;
END $$;