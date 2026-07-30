
-- 1. Settings table (single-row pattern via singleton constraint)
CREATE TABLE IF NOT EXISTS public.retention_settings (
  id boolean PRIMARY KEY DEFAULT true,
  live_retention_days integer NOT NULL DEFAULT 30,
  obfuscate_after_days integer NOT NULL DEFAULT 7,
  cron_schedule text NOT NULL DEFAULT '15 3 * * *',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_settings_singleton CHECK (id = true),
  CONSTRAINT retention_settings_live_valid CHECK (live_retention_days BETWEEN 1 AND 3650),
  CONSTRAINT retention_settings_obf_valid CHECK (obfuscate_after_days BETWEEN 0 AND 3650),
  CONSTRAINT retention_settings_obf_lt_live CHECK (obfuscate_after_days < live_retention_days)
);

GRANT SELECT, INSERT, UPDATE ON public.retention_settings TO authenticated;
GRANT ALL ON public.retention_settings TO service_role;

ALTER TABLE public.retention_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view retention settings"
  ON public.retention_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert retention settings"
  ON public.retention_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update retention settings"
  ON public.retention_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS retention_settings_updated_at ON public.retention_settings;
CREATE TRIGGER retention_settings_updated_at
BEFORE UPDATE ON public.retention_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default singleton
INSERT INTO public.retention_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- 2. Retention job reads from settings
CREATE OR REPLACE FUNCTION public.process_location_data_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _log_id uuid;
  _archived_count integer := 0;
  _obfuscated_count integer := 0;
  _live_days integer;
  _obf_days integer;
BEGIN
  SELECT live_retention_days, obfuscate_after_days
    INTO _live_days, _obf_days
  FROM public.retention_settings
  WHERE id = true;

  _live_days := COALESCE(_live_days, 30);
  _obf_days  := COALESCE(_obf_days, 7);

  INSERT INTO public.data_retention_job_log (job_name, status)
  VALUES ('process_location_data_retention', 'running')
  RETURNING id INTO _log_id;

  BEGIN
    WITH moved AS (
      DELETE FROM public.user_locations
      WHERE created_at < NOW() - make_interval(days => _live_days)
      RETURNING id, user_id, latitude, longitude, accuracy, current_neighborhood_id, created_at
    ),
    inserted AS (
      INSERT INTO public.user_locations_archive
        (id, user_id, latitude, longitude, accuracy, current_neighborhood_id, created_at)
      SELECT id, user_id, latitude, longitude, accuracy, current_neighborhood_id, created_at
      FROM moved
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
    )
    SELECT COUNT(*) INTO _archived_count FROM inserted;

    WITH obf AS (
      UPDATE public.user_locations
      SET
        latitude = ROUND(latitude, 3),
        longitude = ROUND(longitude, 3),
        accuracy = GREATEST(COALESCE(accuracy, 100), 100)
      WHERE created_at < NOW() - make_interval(days => _obf_days)
        AND created_at >= NOW() - make_interval(days => _live_days)
        AND (accuracy IS NULL OR accuracy < 100)
      RETURNING 1
    )
    SELECT COUNT(*) INTO _obfuscated_count FROM obf;

    UPDATE public.data_retention_job_log
    SET status = 'success',
        completed_at = now(),
        rows_archived = _archived_count,
        rows_obfuscated = _obfuscated_count
    WHERE id = _log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.data_retention_job_log
    SET status = 'error',
        completed_at = now(),
        error_message = SQLERRM
    WHERE id = _log_id;
    RAISE;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_location_data_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_location_data_retention() TO service_role;

-- 3. Reschedule cron helper (admin-invokable) so schedule changes take effect
CREATE OR REPLACE FUNCTION public.apply_retention_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _schedule text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT cron_schedule INTO _schedule
  FROM public.retention_settings WHERE id = true;

  IF _schedule IS NULL THEN
    _schedule := '15 3 * * *';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('process-location-data-retention')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-location-data-retention');

    PERFORM cron.schedule(
      'process-location-data-retention',
      _schedule,
      $cron$SELECT public.process_location_data_retention();$cron$
    );
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_retention_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_retention_schedule() TO authenticated, service_role;

-- Apply current schedule from settings (idempotent)
DO $$
DECLARE
  _sched text;
BEGIN
  SELECT cron_schedule INTO _sched FROM public.retention_settings WHERE id = true;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND _sched IS NOT NULL THEN
    PERFORM cron.unschedule('process-location-data-retention')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-location-data-retention');
    PERFORM cron.schedule(
      'process-location-data-retention',
      _sched,
      $cron$SELECT public.process_location_data_retention();$cron$
    );
  END IF;
END $$;
