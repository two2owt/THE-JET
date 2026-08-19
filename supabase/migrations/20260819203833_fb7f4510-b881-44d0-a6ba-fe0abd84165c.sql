CREATE TABLE IF NOT EXISTS public.location_tracking_diagnostics (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text,
  permission_state text,
  permission_checked_at timestamptz,
  prompt_outcome text,
  prompt_outcome_at timestamptz,
  tracking_enabled boolean,
  background_enabled boolean,
  tracker_started_at timestamptz,
  last_write_at timestamptz,
  last_write_source text,
  write_count integer NOT NULL DEFAULT 0,
  last_skip_reason text,
  last_skip_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.location_tracking_diagnostics TO authenticated;
GRANT ALL ON public.location_tracking_diagnostics TO service_role;

ALTER TABLE public.location_tracking_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own location diagnostics" ON public.location_tracking_diagnostics;
CREATE POLICY "Users manage own location diagnostics"
  ON public.location_tracking_diagnostics FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert own location diagnostics" ON public.location_tracking_diagnostics;
CREATE POLICY "Users insert own location diagnostics"
  ON public.location_tracking_diagnostics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own location diagnostics" ON public.location_tracking_diagnostics;
CREATE POLICY "Users update own location diagnostics"
  ON public.location_tracking_diagnostics FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_location_tracking_diagnostics_updated_at ON public.location_tracking_diagnostics;
CREATE TRIGGER set_location_tracking_diagnostics_updated_at
  BEFORE UPDATE ON public.location_tracking_diagnostics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_loc_diag_last_write_at
  ON public.location_tracking_diagnostics (last_write_at DESC NULLS LAST);

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