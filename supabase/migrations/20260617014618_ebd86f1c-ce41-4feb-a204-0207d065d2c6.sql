DROP POLICY IF EXISTS "Users can view own events" ON public.analytics_events;
CREATE POLICY "Users can view own events"
ON public.analytics_events
FOR SELECT
TO authenticated
USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));