CREATE TABLE IF NOT EXISTS public.location_permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'web',
  surface text,
  outcome text NOT NULL,
  method text,
  duration_ms integer,
  prompt_suppressed boolean NOT NULL DEFAULT false,
  fallback_used boolean NOT NULL DEFAULT false,
  detail text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_permission_events_user_created
  ON public.location_permission_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_permission_events_outcome
  ON public.location_permission_events (outcome, created_at DESC);

GRANT SELECT, INSERT ON public.location_permission_events TO authenticated;
GRANT ALL ON public.location_permission_events TO service_role;

ALTER TABLE public.location_permission_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert their own permission events" ON public.location_permission_events;
CREATE POLICY "Users insert their own permission events"
  ON public.location_permission_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read their own permission events" ON public.location_permission_events;
CREATE POLICY "Users read their own permission events"
  ON public.location_permission_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));