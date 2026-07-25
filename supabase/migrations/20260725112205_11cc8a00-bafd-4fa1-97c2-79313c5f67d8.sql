
-- 1. Archive table for historical user location points (>30 days old)
CREATE TABLE IF NOT EXISTS public.user_locations_archive (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  accuracy numeric,
  current_neighborhood_id uuid,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_locations_archive_user_id_idx ON public.user_locations_archive(user_id);
CREATE INDEX IF NOT EXISTS user_locations_archive_created_at_idx ON public.user_locations_archive(created_at);

GRANT SELECT ON public.user_locations_archive TO authenticated;
GRANT ALL ON public.user_locations_archive TO service_role;

ALTER TABLE public.user_locations_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own archived locations"
  ON public.user_locations_archive FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all archived locations"
  ON public.user_locations_archive FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Job log table for tracking retention runs
CREATE TABLE IF NOT EXISTS public.data_retention_job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  rows_archived integer DEFAULT 0,
  rows_obfuscated integer DEFAULT 0,
  rows_deleted integer DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_retention_job_log_started_idx ON public.data_retention_job_log(started_at DESC);

GRANT SELECT ON public.data_retention_job_log TO authenticated;
GRANT ALL ON public.data_retention_job_log TO service_role;

ALTER TABLE public.data_retention_job_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view retention job logs"
  ON public.data_retention_job_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Replace retention function: archive >30d instead of delete, obfuscate 7-30d, log run
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
BEGIN
  INSERT INTO public.data_retention_job_log (job_name, status)
  VALUES ('process_location_data_retention', 'running')
  RETURNING id INTO _log_id;

  BEGIN
    -- Move rows older than 30 days from live table to archive, then delete from live
    WITH moved AS (
      DELETE FROM public.user_locations
      WHERE created_at < NOW() - INTERVAL '30 days'
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

    -- Obfuscate rows in live table 7-30 days old
    WITH obf AS (
      UPDATE public.user_locations
      SET
        latitude = ROUND(latitude, 3),
        longitude = ROUND(longitude, 3),
        accuracy = GREATEST(COALESCE(accuracy, 100), 100)
      WHERE created_at < NOW() - INTERVAL '7 days'
        AND created_at >= NOW() - INTERVAL '30 days'
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

    RAISE NOTICE 'Location retention: archived=%, obfuscated=%', _archived_count, _obfuscated_count;
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

REVOKE EXECUTE ON FUNCTION public.process_location_data_retention() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_location_data_retention() TO service_role;

-- 4. Schedule daily retention job at 03:15 UTC (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('process-location-data-retention')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-location-data-retention');

    PERFORM cron.schedule(
      'process-location-data-retention',
      '15 3 * * *',
      $cron$SELECT public.process_location_data_retention();$cron$
    );
  END IF;
END $$;
