
-- Allow anonymous (signed-out) visitors to log analytics events for top-of-funnel tracking.
-- Restricted so anon can ONLY insert rows with a NULL user_id — they cannot forge someone else's identity.
GRANT INSERT ON public.analytics_events TO anon;

CREATE POLICY "Anon can insert anonymous analytics events"
ON public.analytics_events
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- Tighten authenticated insert: users can only write their own user_id (or NULL for pre-identify events).
DROP POLICY IF EXISTS "Authenticated users can insert analytics events" ON public.analytics_events;
CREATE POLICY "Authenticated users can insert own analytics events"
ON public.analytics_events
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());
