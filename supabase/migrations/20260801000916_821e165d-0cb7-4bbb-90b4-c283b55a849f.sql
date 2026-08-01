CREATE TABLE IF NOT EXISTS public.analytics_events_archive (
  id uuid PRIMARY KEY,
  user_id uuid,
  event_name text NOT NULL,
  event_data jsonb,
  page_path text,
  session_id text,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_archive_created_at_idx
  ON public.analytics_events_archive (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_archive_event_name_idx
  ON public.analytics_events_archive (event_name);

GRANT SELECT ON public.analytics_events_archive TO authenticated;
GRANT ALL ON public.analytics_events_archive TO service_role;

ALTER TABLE public.analytics_events_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view archived analytics" ON public.analytics_events_archive;
CREATE POLICY "Admins can view archived analytics"
ON public.analytics_events_archive
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.cleanup_old_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anonymous service-worker chatter: archive then purge after 7 days
  WITH moved AS (
    DELETE FROM public.analytics_events
    WHERE event_name = 'sw_lifecycle'
      AND user_id IS NULL
      AND created_at < now() - INTERVAL '7 days'
    RETURNING id, user_id, event_name, event_data, page_path, session_id, created_at
  )
  INSERT INTO public.analytics_events_archive
    (id, user_id, event_name, event_data, page_path, session_id, created_at)
  SELECT id, user_id, event_name, event_data, page_path, session_id, created_at
  FROM moved
  ON CONFLICT (id) DO NOTHING;

  -- Everything else: archive then purge after 180 days
  WITH moved AS (
    DELETE FROM public.analytics_events
    WHERE created_at < now() - INTERVAL '180 days'
    RETURNING id, user_id, event_name, event_data, page_path, session_id, created_at
  )
  INSERT INTO public.analytics_events_archive
    (id, user_id, event_name, event_data, page_path, session_id, created_at)
  SELECT id, user_id, event_name, event_data, page_path, session_id, created_at
  FROM moved
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_analytics_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_analytics_events() TO service_role;