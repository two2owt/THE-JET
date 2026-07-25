
-- 1. Extend the log with validation columns
ALTER TABLE public.data_retention_job_log
  ADD COLUMN IF NOT EXISTS rows_expected integer,
  ADD COLUMN IF NOT EXISTS validation_status text;

-- 2. Retention job: count deletions separately, compare to archive inserts
CREATE OR REPLACE FUNCTION public.process_location_data_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _log_id uuid;
  _deleted_count integer := 0;
  _archived_count integer := 0;
  _obfuscated_count integer := 0;
  _live_days integer;
  _obf_days integer;
  _validation text;
  _status text;
  _err text;
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
    -- Move + count in one CTE chain so deletes and inserts are comparable
    WITH moved AS (
      DELETE FROM public.user_locations
      WHERE created_at < NOW() - make_interval(days => _live_days)
      RETURNING id, user_id, latitude, longitude, accuracy, current_neighborhood_id, created_at
    ),
    moved_count AS (
      SELECT COUNT(*)::int AS c FROM moved
    ),
    inserted AS (
      INSERT INTO public.user_locations_archive
        (id, user_id, latitude, longitude, accuracy, current_neighborhood_id, created_at)
      SELECT id, user_id, latitude, longitude, accuracy, current_neighborhood_id, created_at
      FROM moved
      ON CONFLICT (id) DO NOTHING
      RETURNING 1
    ),
    inserted_count AS (
      SELECT COUNT(*)::int AS c FROM inserted
    )
    SELECT
      (SELECT c FROM moved_count),
      (SELECT c FROM inserted_count)
    INTO _deleted_count, _archived_count;

    -- Obfuscate 7-30d (or configured window) rows in the live table
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

    -- Validation: archive count must equal live delete count
    IF _archived_count = _deleted_count THEN
      _validation := 'ok';
      _status := 'success';
      _err := NULL;
    ELSE
      _validation := 'mismatch';
      _status := 'mismatch';
      _err := format(
        'Archive validation failed: deleted %s row(s) from user_locations but archived %s row(s) (delta %s). Likely cause: duplicate archive ids skipped by ON CONFLICT DO NOTHING.',
        _deleted_count, _archived_count, _deleted_count - _archived_count
      );
      RAISE WARNING '%', _err;
    END IF;

    UPDATE public.data_retention_job_log
    SET status = _status,
        completed_at = now(),
        rows_expected = _deleted_count,
        rows_archived = _archived_count,
        rows_deleted = _deleted_count,
        rows_obfuscated = _obfuscated_count,
        validation_status = _validation,
        error_message = _err
    WHERE id = _log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.data_retention_job_log
    SET status = 'error',
        completed_at = now(),
        error_message = SQLERRM,
        validation_status = 'error'
    WHERE id = _log_id;
    RAISE;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_location_data_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_location_data_retention() TO service_role;
