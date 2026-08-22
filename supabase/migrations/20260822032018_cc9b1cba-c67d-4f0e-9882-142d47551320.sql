-- Map sync latency telemetry: write -> fetch -> render -> end-to-end
CREATE TABLE IF NOT EXISTS public.map_sync_latency_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('write','fetch','render','end_to_end')),
  layer text NOT NULL DEFAULT 'heatmap',
  latency_ms integer NOT NULL CHECK (latency_ms >= 0 AND latency_ms <= 3600000),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT, SELECT ON public.map_sync_latency_samples TO authenticated;
GRANT ALL ON public.map_sync_latency_samples TO service_role;
ALTER TABLE public.map_sync_latency_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert their own latency samples" ON public.map_sync_latency_samples;
CREATE POLICY "Users insert their own latency samples"
  ON public.map_sync_latency_samples FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read their own latency samples" ON public.map_sync_latency_samples;
CREATE POLICY "Users read their own latency samples"
  ON public.map_sync_latency_samples FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_map_sync_latency_stage_time
  ON public.map_sync_latency_samples (stage, created_at DESC);

-- Thresholds
CREATE TABLE IF NOT EXISTS public.map_sync_latency_thresholds (
  stage text PRIMARY KEY,
  warn_ms integer NOT NULL,
  crit_ms integer NOT NULL,
  min_samples integer NOT NULL DEFAULT 5,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.map_sync_latency_thresholds TO authenticated;
GRANT ALL ON public.map_sync_latency_thresholds TO service_role;
ALTER TABLE public.map_sync_latency_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read latency thresholds" ON public.map_sync_latency_thresholds;
CREATE POLICY "Admins read latency thresholds"
  ON public.map_sync_latency_thresholds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- idempotency-check: allow-dml
INSERT INTO public.map_sync_latency_thresholds (stage, warn_ms, crit_ms, min_samples) VALUES
  ('write', 1500, 4000, 5),
  ('fetch', 2500, 6000, 5),
  ('render', 1200, 3000, 5),
  ('end_to_end', 45000, 90000, 5)
ON CONFLICT (stage) DO NOTHING;

-- Alerts
CREATE TABLE IF NOT EXISTS public.map_sync_latency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  observed_p95_ms numeric NOT NULL,
  threshold_ms numeric NOT NULL,
  sample_count integer NOT NULL,
  message text NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.map_sync_latency_alerts TO authenticated;
GRANT ALL ON public.map_sync_latency_alerts TO service_role;
ALTER TABLE public.map_sync_latency_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read latency alerts" ON public.map_sync_latency_alerts;
CREATE POLICY "Admins read latency alerts"
  ON public.map_sync_latency_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS map_sync_latency_alerts_open_uniq
  ON public.map_sync_latency_alerts (stage) WHERE status = 'open';

DROP TRIGGER IF EXISTS map_sync_latency_alerts_updated_at ON public.map_sync_latency_alerts;
CREATE TRIGGER map_sync_latency_alerts_updated_at
  BEFORE UPDATE ON public.map_sync_latency_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Metrics rollup
CREATE OR REPLACE FUNCTION public.map_sync_latency_metrics(_window_minutes integer DEFAULT 60)
RETURNS TABLE(
  stage text,
  samples bigint,
  users bigint,
  p50_ms numeric,
  p95_ms numeric,
  max_ms integer,
  newest_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.stage,
    count(*),
    count(DISTINCT s.user_id),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY s.latency_ms)::numeric, 0),
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY s.latency_ms)::numeric, 0),
    max(s.latency_ms),
    max(s.created_at)
  FROM public.map_sync_latency_samples s
  WHERE s.created_at > now() - make_interval(mins => GREATEST(COALESCE(_window_minutes, 60), 1))
    AND (
      COALESCE(auth.role(), current_user) IN ('service_role','postgres','supabase_admin')
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  GROUP BY s.stage
  ORDER BY s.stage;
$$;
REVOKE ALL ON FUNCTION public.map_sync_latency_metrics(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.map_sync_latency_metrics(integer) TO service_role;

-- Degradation check + email alert
CREATE OR REPLACE FUNCTION public.check_map_sync_latency()
RETURNS TABLE(opened integer, resolved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  th record;
  sev text;
  thr numeric;
  n_open integer := 0;
  n_res integer := 0;
  seen text[] := ARRAY[]::text[];
  admin_email text;
  body text;
  is_new boolean;
BEGIN
  IF COALESCE(auth.role(), current_user) NOT IN ('service_role','postgres','supabase_admin')
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR th IN SELECT * FROM public.map_sync_latency_thresholds WHERE enabled LOOP
    SELECT
      count(*) AS samples,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0) AS p95
    INTO m
    FROM public.map_sync_latency_samples
    WHERE stage = th.stage
      AND created_at > now() - interval '30 minutes';

    CONTINUE WHEN m.samples IS NULL OR m.samples < th.min_samples;

    IF m.p95 >= th.crit_value_placeholder_never THEN NULL; END IF;

    IF m.p95 >= th.crit_ms THEN sev := 'critical'; thr := th.crit_ms;
    ELSIF m.p95 >= th.warn_ms THEN sev := 'warning'; thr := th.warn_ms;
    ELSE sev := NULL; thr := NULL;
    END IF;

    IF sev IS NULL THEN
      UPDATE public.map_sync_latency_alerts
        SET status = 'resolved', resolved_at = now(), updated_at = now()
        WHERE stage = th.stage AND status = 'open';
      IF FOUND THEN n_res := n_res + 1; END IF;
      CONTINUE;
    END IF;

    seen := seen || th.stage;
    is_new := NOT EXISTS (
      SELECT 1 FROM public.map_sync_latency_alerts
      WHERE stage = th.stage AND status = 'open' AND severity = sev
    );

    INSERT INTO public.map_sync_latency_alerts
      (stage, severity, observed_p95_ms, threshold_ms, sample_count, message)
    VALUES (
      th.stage, sev, m.p95, thr, m.samples,
      format('Map sync %s p95 is %sms over the last 30 min (threshold %sms, %s samples)',
             th.stage, m.p95, thr, m.samples)
    )
    ON CONFLICT (stage) WHERE status = 'open'
    DO UPDATE SET severity = EXCLUDED.severity,
                  observed_p95_ms = EXCLUDED.observed_p95_ms,
                  threshold_ms = EXCLUDED.threshold_ms,
                  sample_count = EXCLUDED.sample_count,
                  message = EXCLUDED.message,
                  updated_at = now();
    n_open := n_open + 1;

    IF is_new THEN
      body := format(
        '<h2>JET map sync degradation</h2><p><strong>%s</strong> stage p95 latency is <strong>%sms</strong> over the last 30 minutes (threshold %sms, %s samples).</p><p>Check the Admin dashboard → System → Map Sync Latency.</p>',
        th.stage, m.p95, thr, m.samples
      );
      FOR admin_email IN
        SELECT u.email FROM auth.users u
        JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'admin'::app_role
        WHERE u.email IS NOT NULL
      LOOP
        BEGIN
          PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
            'to', admin_email,
            'subject', format('[JET] Map sync %s latency %s', th.stage, sev),
            'html', body,
            'label', 'map_sync_latency_alert'
          ));
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'map sync alert email failed: %', SQLERRM;
        END;
      END LOOP;
      UPDATE public.map_sync_latency_alerts
        SET notified_at = now() WHERE stage = th.stage AND status = 'open';
    END IF;
  END LOOP;

  -- Retention: keep 7 days of raw samples
  DELETE FROM public.map_sync_latency_samples WHERE created_at < now() - interval '7 days';

  opened := n_open; resolved := n_res;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.check_map_sync_latency() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_map_sync_latency() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('check-map-sync-latency')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-map-sync-latency');
    PERFORM cron.schedule('check-map-sync-latency', '*/10 * * * *',
      $cron$SELECT public.check_map_sync_latency();$cron$);
  END IF;
END $$;