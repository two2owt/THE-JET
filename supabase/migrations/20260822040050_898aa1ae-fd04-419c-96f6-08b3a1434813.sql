-- 1. Privacy-safe realtime pulse for map layers -------------------------------
CREATE TABLE IF NOT EXISTS public.map_data_pulse (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  point_count bigint NOT NULL DEFAULT 0
);

GRANT SELECT ON public.map_data_pulse TO authenticated;
GRANT ALL ON public.map_data_pulse TO service_role;

ALTER TABLE public.map_data_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read the map pulse" ON public.map_data_pulse;
CREATE POLICY "Authenticated users can read the map pulse"
  ON public.map_data_pulse FOR SELECT TO authenticated USING (true);

-- idempotency-check: allow-dml
INSERT INTO public.map_data_pulse (id, updated_at, point_count)
VALUES (true, now(), 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_map_data_pulse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.map_data_pulse (id, updated_at, point_count)
  VALUES (true, now(), 1)
  ON CONFLICT (id) DO UPDATE
    SET updated_at = now(),
        point_count = public.map_data_pulse.point_count + 1;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_map_data_pulse ON public.user_locations;
CREATE TRIGGER trg_bump_map_data_pulse
AFTER INSERT ON public.user_locations
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_map_data_pulse();

ALTER TABLE public.map_data_pulse REPLICA IDENTITY DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'map_data_pulse'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.map_data_pulse';
  END IF;
END $$;

-- idempotency-check: allow-dml
INSERT INTO public.realtime_guard_allowlist (table_name, sensitivity, note, allow_replica_identity_full)
VALUES ('map_data_pulse', 'public',
        'Aggregate heartbeat only: timestamp + cumulative count, no user or coordinate data.',
        false)
ON CONFLICT (table_name) DO UPDATE
  SET sensitivity = EXCLUDED.sensitivity, note = EXCLUDED.note;

-- 2. Reliable notification queue worker ---------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_notification_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  svc_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notification_queue
    WHERE scheduled_at <= now()
      AND attempts < max_attempts
      AND (status = 'pending'
        OR (status = 'processing' AND locked_at < now() - interval '5 minutes'))
  ) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO svc_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';
  IF base_url IS NULL THEN
    RAISE WARNING 'dispatch_notification_queue: project_url missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/notifications-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json')
               || CASE WHEN svc_key IS NULL THEN '{}'::jsonb
                       ELSE jsonb_build_object('Authorization', 'Bearer ' || svc_key) END,
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification_queue() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('dispatch-notification-queue')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-notification-queue');
    PERFORM cron.schedule('dispatch-notification-queue', '* * * * *',
      $cron$SELECT public.dispatch_notification_queue();$cron$);
  END IF;
END $$;