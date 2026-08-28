-- lovable-cron-fallback-reviewed: 5760 runs/day; wake-on-enqueue queue that unschedules itself on drain, so it only ticks while a bulk activation-email job is actually in flight and 0 times per day otherwise; needed so queued emails keep sending after the admin closes the page
CREATE TABLE IF NOT EXISTS public.admin_nudge_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','paused','completed','failed','canceled')),
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  consecutive_failures integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.admin_nudge_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.admin_nudge_jobs(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_nudge_job_items_unique
  ON public.admin_nudge_job_items (job_id, lower(email));
CREATE INDEX IF NOT EXISTS admin_nudge_job_items_pending
  ON public.admin_nudge_job_items (job_id, status);
CREATE INDEX IF NOT EXISTS admin_nudge_jobs_active
  ON public.admin_nudge_jobs (status, created_at DESC);

GRANT SELECT ON public.admin_nudge_jobs TO authenticated;
GRANT SELECT ON public.admin_nudge_job_items TO authenticated;
GRANT ALL ON public.admin_nudge_jobs TO service_role;
GRANT ALL ON public.admin_nudge_job_items TO service_role;

ALTER TABLE public.admin_nudge_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_nudge_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read nudge jobs" ON public.admin_nudge_jobs;
CREATE POLICY "Admins read nudge jobs" ON public.admin_nudge_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read nudge job items" ON public.admin_nudge_job_items;
CREATE POLICY "Admins read nudge job items" ON public.admin_nudge_job_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.nudge_queue_endpoint()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT rtrim(
    coalesce(
      nullif(current_setting('app.settings.nudge_worker_url', true), ''),
      'https://jet-around.com'
    ), '/') || '/api/public/nudge-queue/process';
$$;

REVOKE EXECUTE ON FUNCTION public.nudge_queue_endpoint() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nudge_queue_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  svc_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_nudge_jobs j
    JOIN public.admin_nudge_job_items i ON i.job_id = j.id AND i.status = 'pending'
    WHERE j.status IN ('queued','running')
  ) THEN
    BEGIN
      PERFORM cron.unschedule('process-nudge-queue')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-nudge-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'nudge_queue_dispatch: unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO svc_key
  FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';

  PERFORM net.http_post(
    url := public.nudge_queue_endpoint(),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Lovable-Context', 'cron')
      || CASE WHEN svc_key IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('Authorization', 'Bearer ' || svc_key) END,
    body := '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.nudge_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nudge_queue_dispatch() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_enqueue_nudge_job(_recipients jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _job_id uuid;
  _existing uuid;
  _count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO _existing FROM public.admin_nudge_jobs
  WHERE status IN ('queued','running') ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  IF _recipients IS NULL OR jsonb_typeof(_recipients) <> 'array'
     OR jsonb_array_length(_recipients) = 0 THEN
    RAISE EXCEPTION 'No recipients supplied';
  END IF;
  IF jsonb_array_length(_recipients) > 1000 THEN
    RAISE EXCEPTION 'Too many recipients in one job (max 1000)';
  END IF;

  INSERT INTO public.admin_nudge_jobs (created_by, status)
  VALUES (auth.uid(), 'queued')
  RETURNING id INTO _job_id;

  INSERT INTO public.admin_nudge_job_items (job_id, email, display_name)
  SELECT _job_id, lower(trim(r->>'email')), nullif(r->>'display_name','')
  FROM jsonb_array_elements(_recipients) r
  WHERE coalesce(trim(r->>'email'), '') <> ''
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO _count FROM public.admin_nudge_job_items WHERE job_id = _job_id;
  UPDATE public.admin_nudge_jobs SET total = _count, updated_at = now() WHERE id = _job_id;

  BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000009);
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-nudge-queue') THEN
      PERFORM cron.schedule('process-nudge-queue', '15 seconds',
        $cron$SELECT public.nudge_queue_dispatch();$cron$);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_enqueue_nudge_job: cron schedule failed: %', SQLERRM;
  END;

  PERFORM public.nudge_queue_dispatch();
  RETURN _job_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_enqueue_nudge_job(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_enqueue_nudge_job(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_cancel_nudge_job(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.admin_nudge_jobs
     SET status = 'canceled', finished_at = now(), updated_at = now(), lease_expires_at = NULL
   WHERE id = _job_id AND status IN ('queued','running','paused');
  DELETE FROM public.admin_nudge_job_items WHERE job_id = _job_id AND status = 'pending';
  PERFORM public.nudge_queue_dispatch();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_nudge_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_nudge_job(uuid) TO authenticated;