-- Email queue monitoring: metrics, thresholds, alerts, and a scheduled health check.

CREATE TABLE IF NOT EXISTS public.email_queue_thresholds (
  metric text PRIMARY KEY,
  warn_value numeric NOT NULL,
  crit_value numeric NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_queue_thresholds TO authenticated;
GRANT ALL ON public.email_queue_thresholds TO service_role;
ALTER TABLE public.email_queue_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read email queue thresholds" ON public.email_queue_thresholds;
CREATE POLICY "Admins read email queue thresholds"
  ON public.email_queue_thresholds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.email_queue_thresholds (metric, warn_value, crit_value) VALUES
  ('queue_depth', 50, 250),
  ('processing_lag_seconds', 300, 900),
  ('dlq_depth', 1, 10)
ON CONFLICT (metric) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.email_queue_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name text NOT NULL,
  metric text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  observed_value numeric NOT NULL,
  threshold_value numeric NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS email_queue_alerts_open_unique
  ON public.email_queue_alerts (queue_name, metric) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS email_queue_alerts_created_idx
  ON public.email_queue_alerts (created_at DESC);

GRANT SELECT, UPDATE ON public.email_queue_alerts TO authenticated;
GRANT ALL ON public.email_queue_alerts TO service_role;
ALTER TABLE public.email_queue_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read email queue alerts" ON public.email_queue_alerts;
CREATE POLICY "Admins read email queue alerts"
  ON public.email_queue_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins resolve email queue alerts" ON public.email_queue_alerts;
CREATE POLICY "Admins resolve email queue alerts"
  ON public.email_queue_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Point-in-time metrics for the live email queues (depth, lag, DLQ depth).
CREATE OR REPLACE FUNCTION public.email_queue_metrics()
RETURNS TABLE (
  queue_name text,
  queue_depth bigint,
  processing_lag_seconds numeric,
  dlq_depth bigint,
  newest_message_age_seconds numeric,
  total_enqueued bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
DECLARE
  q text;
  m record;
  dlq_len bigint;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOREACH q IN ARRAY ARRAY['auth_emails','transactional_emails'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() lq WHERE lq.queue_name = q) THEN
      CONTINUE;
    END IF;
    SELECT * INTO m FROM pgmq.metrics(q);
    dlq_len := 0;
    IF EXISTS (SELECT 1 FROM pgmq.list_queues() lq WHERE lq.queue_name = q || '_dlq') THEN
      SELECT mm.queue_length INTO dlq_len FROM pgmq.metrics(q || '_dlq') mm;
    END IF;

    queue_name := q;
    queue_depth := COALESCE(m.queue_length, 0);
    processing_lag_seconds := COALESCE(m.oldest_msg_age_sec, 0);
    dlq_depth := COALESCE(dlq_len, 0);
    newest_message_age_seconds := COALESCE(m.newest_msg_age_sec, 0);
    total_enqueued := COALESCE(m.total_messages, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.email_queue_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_queue_metrics() TO authenticated, service_role;

-- Evaluate metrics against thresholds; open new alerts, resolve recovered ones.
CREATE OR REPLACE FUNCTION public.check_email_queue_health()
RETURNS TABLE (opened integer, resolved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pgmq', 'public'
AS $$
DECLARE
  rec record;
  th record;
  val numeric;
  sev text;
  thr numeric;
  n_open integer := 0;
  n_res integer := 0;
BEGIN
  FOR rec IN SELECT * FROM public.email_queue_metrics() LOOP
    FOR th IN SELECT * FROM public.email_queue_thresholds WHERE enabled LOOP
      val := CASE th.metric
        WHEN 'queue_depth' THEN rec.queue_depth::numeric
        WHEN 'processing_lag_seconds' THEN rec.processing_lag_seconds
        WHEN 'dlq_depth' THEN rec.dlq_depth::numeric
        ELSE NULL END;
      CONTINUE WHEN val IS NULL;

      IF val >= th.crit_value THEN sev := 'critical'; thr := th.crit_value;
      ELSIF val >= th.warn_value THEN sev := 'warning'; thr := th.warn_value;
      ELSE sev := NULL; thr := NULL;
      END IF;

      IF sev IS NULL THEN
        UPDATE public.email_queue_alerts
          SET status = 'resolved', resolved_at = now(), updated_at = now()
          WHERE queue_name = rec.queue_name AND metric = th.metric AND status = 'open';
        IF FOUND THEN n_res := n_res + 1; END IF;
      ELSE
        INSERT INTO public.email_queue_alerts
          (queue_name, metric, severity, observed_value, threshold_value, message)
        VALUES (
          rec.queue_name, th.metric, sev, val, thr,
          format('%s on %s is %s (threshold %s)', th.metric, rec.queue_name, val, thr)
        )
        ON CONFLICT (queue_name, metric) WHERE status = 'open'
        DO UPDATE SET
          severity = EXCLUDED.severity,
          observed_value = EXCLUDED.observed_value,
          threshold_value = EXCLUDED.threshold_value,
          message = EXCLUDED.message,
          updated_at = now();
        n_open := n_open + 1;
      END IF;
    END LOOP;
  END LOOP;

  opened := n_open; resolved := n_res;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_email_queue_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_email_queue_health() TO authenticated, service_role;

SELECT cron.unschedule('email-queue-health-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-queue-health-check');

SELECT cron.schedule(
  'email-queue-health-check',
  '*/5 * * * *',
  $cron$SELECT public.check_email_queue_health();$cron$
);